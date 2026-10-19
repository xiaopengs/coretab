@echo off
chcp 65001 >nul
setlocal EnableExtensions

rem ============================================================
rem  CoreTab 音频伴生程序安装脚本（Windows）
rem  作用：安装用于免弹窗采集全系统声音的 Native Messaging 主机
rem  用法：install_windows.bat <扩展ID>
rem    扩展ID 在 chrome://extensions 打开"开发者模式"后可见
rem ============================================================

set "HOST_NAME=com.coretab.audio_capture"
set "EXT_ID=%~1"

if "%EXT_ID%"=="" (
  echo [提示] 未通过参数提供扩展 ID。
  echo 扩展 ID 可在 chrome://extensions 开启"开发者模式"后，在 CoreTab 卡片上看到。
  set /p EXT_ID="请粘贴扩展 ID 后回车: "
)
if "%EXT_ID%"=="" (
  echo [错误] 未提供扩展 ID，已取消安装。
  exit /b 1
)

rem ---------- 1. 定位 Python ----------
where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 python。请先安装 Python 3 并勾选"Add Python to PATH"。
  pause
  exit /b 1
)
for /f "delims=" %%v in ('python --version 2^>^&1') do set "PYVER=%%v"
echo [信息] 使用 %PYVER%

rem ---------- 2. 安装依赖 ----------
echo [信息] 正在安装依赖 soundcard / numpy ...
python -m pip install --upgrade soundcard numpy
if errorlevel 1 (
  echo [错误] 依赖安装失败。请检查网络，或手动执行：
  echo        python -m pip install soundcard numpy
  pause
  exit /b 1
)

rem ---------- 3. 准备稳定目录并复制脚本 ----------
set "DEST=%LOCALAPPDATA%\CoreTab\native"
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%~dp0coretab_audio_host.py" "%DEST%\coretab_audio_host.py" >nul
copy /y "%~dp0make_manifest.py" "%DEST%\make_manifest.py" >nul
echo [信息] 脚本已复制到 %DEST%

rem ---------- 4. 生成运行包装 run_host.bat ----------
> "%DEST%\run_host.bat" echo @echo off
>> "%DEST%\run_host.bat" echo pythonw "%DEST%\coretab_audio_host.py"
echo [信息] 已生成 run_host.bat

rem ---------- 5. 生成 Native Messaging 清单 ----------
python "%DEST%\make_manifest.py" "%DEST%" "%HOST_NAME%" "%EXT_ID%"
if errorlevel 1 (
  echo [错误] 生成清单失败。
  pause
  exit /b 1
)

rem ---------- 6. 写入注册表 ----------
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%DEST%\%HOST_NAME%.json" /f
if errorlevel 1 (
  echo [错误] 注册表写入失败。请尝试以管理员身份运行本脚本。
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  安装完成！
echo  请完全退出 Chrome（包括后台进程）后重新打开，
echo  然后在扩展页面重新加载 CoreTab，即可使用免弹窗内录。
echo ============================================================
pause
exit /b 0
