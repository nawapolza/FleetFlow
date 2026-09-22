@echo off
chcp 65001 >nul
setlocal
where node >nul 2>nul || (
  echo [ERROR] กรุณาติดตั้ง Node.js 20 ก่อน
  pause
  exit /b 1
)
echo ติดตั้ง Backend...
pushd backend
call npm install
if errorlevel 1 goto :fail
popd
echo ติดตั้ง Frontend...
pushd frontend
call npm install
if errorlevel 1 goto :fail
popd
echo.
echo ติดตั้งเสร็จแล้ว ให้คัดลอก backend\.env.example เป็น backend\.env และกรอก MongoDB
pause
exit /b 0
:fail
echo.
echo ติดตั้งไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตและ npm
popd
pause
exit /b 1
