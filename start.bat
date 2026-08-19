@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DeepSeek Harness 桌面版
echo 正在启动 DeepSeek Harness 桌面版...
"%~dp0node_modules\.bin\electron.cmd" .
