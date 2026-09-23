# คู่มือแก้ไขเข้าสู่ระบบ (ขวัญใจดาวทองขนส่ง)

ระบบที่แสดงคำว่า “บันทึกข้อมูลไม่ได้” บนหน้า Login ไม่ได้แปลว่ารหัสผ่านผิดเสมอไป โปรเจกต์นี้ตรวจข้อผิดพลาดแยกเป็น: Username/Password ผิด (HTTP 401), Backend ติดต่อไม่ได้, ตั้ง API ผิด, และ MongoDB ไม่พร้อม

## 1. Render Static Site (Frontend)
- Environment > `VITE_API_URL` = URL **Backend Web Service** จริง เช่น `https://YOUR-BACKEND.onrender.com` (ไม่ใส่ `/api` และไม่ใช่ URL Static Site)
- Build Command: `npm ci --include=dev --no-audit --no-fund && npm run build`
- Root Directory: `frontend`; Publish Directory: `dist`
- กด Deploy latest commit หลังเปลี่ยน Environment เพราะ Vite อ่านค่าในขั้นตอน Build

## 2. Render Backend Web Service
- ตั้ง `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET` ตามฐานข้อมูลที่ใช้จริง
- หากตั้ง `CORS_ALLOW_ALL=false` ให้เพิ่ม `https://fleetflow-1-ajlc.onrender.com` ใน `CORS_ALLOWED_ORIGINS`
- เปิด `https://YOUR-BACKEND.onrender.com/ping` เพื่อตรวจว่า Backend ทำงาน
- เปิด `https://YOUR-BACKEND.onrender.com/health-ready` เพื่อตรวจว่าฐานข้อมูลเชื่อมต่อพร้อม
- ถ้า `/ping` ผ่านแต่ `/health-ready` ไม่ผ่าน ให้เปิด Backend Logs เพื่อตรวจปัญหา MongoDB ไม่ต้องรีเซ็ตบัญชีหรือรหัสผ่าน

## 3. ข้อควรระวัง
- อย่าส่งรหัสผ่าน MongoDB, JWT_SECRET หรือ ADMIN_RECOVERY_KEY เข้าแชทหรือ GitHub
- หากเคยเผยรหัสผ่าน MongoDB ต่อสาธารณะให้เปลี่ยนรหัสผ่านที่ Atlas
- อย่าสร้างบัญชีใหม่หรือลบข้อมูลเพียงเพราะ Backend หยุดทำงาน
- หาก Backend เปลี่ยนฐานข้อมูล (`MONGODB_DB`) บัญชีเก่าจะไม่ปรากฏในฐานข้อมูลใหม่ ต้องกลับไปชี้ฐานข้อมูลเดิม
- ไฟล์นี้ไม่รวมรหัสผ่านหรือไฟล์ .env จริง
