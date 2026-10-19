#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CoreTab 音频伴生程序（Native Messaging Host）

作用：采集全系统声音（Windows 上用 WASAPI 回环），把 16kHz 单声道 PCM 通过
Native Messaging 实时推给 CoreTab 扩展，供语音识别。这样无需弹出共享窗口，
也能录到桌面客户端（Zoom / 腾讯会议等）的声音。

协议（与扩展端 js/asr/asr-capture.js 对应）：
  扩展 -> 本程序：{"type":"start","sampleRate":16000} / {"type":"stop"}
  本程序 -> 扩展：{"type":"ready"} / {"type":"audio","data":"<base64 int16 pcm>"}
                 / {"type":"error","message":"..."} / {"type":"stopped"}

依赖：pip install soundcard numpy
"""

import sys
import json
import struct
import base64
import threading

SAMPLE_RATE = 16000
CHUNK_FRAMES = 5120  # 320ms，约 13KB Base64，控制推送频率避免背压

# 运行标志（由 stdin 控制线程置为 False）
_running = True


def log(msg):
    # stderr 不会被 Chrome 当作 Native Messaging 数据，安全用于诊断
    try:
        sys.stderr.write("[coretab-audio] %s\n" % msg)
        sys.stderr.flush()
    except Exception:
        pass


def send_msg(obj):
    """按 Native Messaging 规范写一条消息：4 字节小端长度 + UTF-8 JSON。"""
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def read_msg():
    """读一条 Native Messaging 消息；stdin 关闭或数据不足时返回 None。"""
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len or len(raw_len) < 4:
        return None
    n = struct.unpack("<I", raw_len)[0]
    if n <= 0 or n > 1024 * 1024:
        return None
    body = sys.stdin.buffer.read(n)
    if len(body) < n:
        return None
    try:
        return json.loads(body.decode("utf-8"))
    except Exception:
        return None


def stdin_loop():
    """监听扩展发来的控制消息；收到 stop 或 stdin 关闭即停止采集。"""
    global _running
    while _running:
        msg = read_msg()
        if msg is None:
            _running = False
            break
        mtype = msg.get("type")
        if mtype == "stop":
            _running = False
            break


def open_loopback():
    """
    打开系统声音回环采集，返回 (recorder_ctx, np)。
    优先使用 soundcard（免编译、免虚拟声卡）。
    """
    import numpy as np
    import soundcard as sc

    speaker = sc.default_speaker()
    if speaker is None:
        raise RuntimeError("找不到默认音频输出设备")
    recorder = speaker.recorder(samplerate=SAMPLE_RATE)
    return recorder, np


def main():
    global _running

    # 先尝试导入依赖，失败则回报错误并退出
    try:
        recorder, np = open_loopback()
    except Exception as e:
        send_msg({
            "type": "error",
            "message": "无法采集系统声音：%s。请确认已运行 pip install soundcard numpy，"
                       "且系统存在可用的音频输出设备。" % e
        })
        log("open_loopback failed: %s" % e)
        return

    # 通知扩展：伴生程序已就绪
    send_msg({"type": "ready"})
    log("ready, samplerate=%d" % SAMPLE_RATE)

    # 启动控制线程监听 stop / 断开
    t = threading.Thread(target=stdin_loop, daemon=True)
    t.start()

    try:
        with recorder:
            while _running:
                frames = recorder.record(numframes=CHUNK_FRAMES)
                if frames is None or len(frames) == 0:
                    continue
                # 多声道 -> 单声道
                if frames.ndim > 1:
                    mono = frames.mean(axis=1)
                else:
                    mono = frames
                mono = mono.astype("float32")
                # float32 [-1,1] -> int16 小端
                pcm16 = (mono.clip(-1.0, 1.0) * 32767.0).astype("<i2")
                send_msg({
                    "type": "audio",
                    "data": base64.b64encode(pcm16.tobytes()).decode("ascii")
                })
    except Exception as e:
        send_msg({"type": "error", "message": "采集出错：%s" % e})
        log("capture error: %s" % e)
    finally:
        _running = False
        try:
            send_msg({"type": "stopped"})
        except Exception:
            pass
        log("stopped")


if __name__ == "__main__":
    main()
