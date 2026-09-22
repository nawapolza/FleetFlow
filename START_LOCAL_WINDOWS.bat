@echo off
chcp 65001 >nul
setlocal
if not exist backend\.env (
  echo [ERROR] ไม่พบ backend\.env
  echo กรุณาคัดลอก backend\.env.example เป็น backend\.env แล้วกรอก MONGODB_URI / JWT_SECRET
  pause
  exit /b 1
)
start "HENG Backend V60" cmd /k "cd /d %~dp0backend && npm run dev"
start "HENG Frontend V60" cmd /k "cd /d %~dp0frontend && npm run dev"
echo เปิดระบบแล้ว
 echo Frontend: http://localhost:5173
 echo Backend:  http://localhost:3000/health
pause
