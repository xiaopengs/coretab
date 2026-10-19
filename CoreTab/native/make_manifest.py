#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 Chrome Native Messaging 主机清单（manifest JSON）。
由 install_windows.bat 调用，避免在批处理里手写 JSON 转义。

用法：python make_manifest.py <目标目录> <host_name> <扩展ID>
"""

import json
import os
import sys


def main():
    if len(sys.argv) < 4:
        print("用法: python make_manifest.py <目标目录> <host_name> <扩展ID>")
        return 1

    dest, host, ext = sys.argv[1], sys.argv[2], sys.argv[3]

    manifest = {
        "name": host,
        "description": "CoreTab system audio capture (WASAPI loopback)",
        "path": os.path.join(dest, "run_host.bat"),
        "type": "stdio",
        "allowed_origins": ["chrome-extension://%s/" % ext],
    }

    out = os.path.join(dest, host + ".json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print("manifest written:", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
