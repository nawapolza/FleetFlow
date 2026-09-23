# ขวัญใจดาวทองขนส่ง — คู่มือตรวจสอบ Login / Admin recovery / การบันทึกข้อมูล

## ข้อสำคัญ
เวอร์ชันนี้ไม่ได้เปลี่ยนหรือลบข้อมูลบัญชีเดิม ไม่ได้ฝังรหัสผ่าน MongoDB หรือรหัสกู้คืน Admin ลงในโค้ด และไม่สามารถรับประกันผลการบันทึกบนฐานข้อมูลจริงก่อนทดสอบกับ Render + Atlas ของผู้ใช้ได้

## ตั้งค่า Render ให้ครบก่อนทดลอง
1. Static Site Frontend: Root Directory = `frontend`; Build = `npm ci --include=dev --no-audit --no-fund && npm run build`; Publish Directory = `dist`.
2. **Frontend > Environment**: `VITE_API_URL=https://<ชื่อ-backend-web-service>.onrender.com` (ห้ามชี้กลับมาที่ URL Static Site; ไม่ต้องลงท้ายด้วย `/api`). **ต้อง Deploy Frontend ใหม่หลังเปลี่ยนค่า** เพราะ Vite ฝังค่านี้ตอน Build
3. Backend Web Service: Root Directory = `backend`; Build = `npm ci --no-audit --no-fund`; Start = `npm start`.
4. **Backend > Environment**: `MONGODB_URI` = Atlas connection string ใหม่ (อย่าใส่ใน GitHub), `MONGODB_DB=test` ถ้าบัญชีเดิมอยู่ในฐานข้อมูล `test`, `JWT_SECRET` = รหัสลับแบบสุ่ม, `ADMIN_RECOVERY_KEY` = รหัสลับแบบสุ่ม *อีกชุด* ยาวอย่างน้อย 32 อักขระ; `CORS_ALLOW_ALL=false`; `CORS_ALLOWED_ORIGINS=https://fleetflow-1-ajlc.onrender.com`.
5. เปิด `https://<ชื่อ-backend-web-service>.onrender.com/ping` ต้องตอบ JSON success true; เปิด `/health-ready` ต้องตอบ JSON success true. ถ้า `/ping` ผ่านแต่ `/health-ready` ไม่ผ่าน ให้ดู Backend Logs: มักเกิดจาก Atlas IP access, DB user permission, ชื่อฐานข้อมูล, connection string หรือการสร้าง/แก้ไขดัชนีที่ไม่สำเร็จ
6. กรณีเซิร์ฟเวอร์ตอบ 401 คือชื่อผู้ใช้/รหัสผ่านไม่ตรง; 403 บนหน้า Admin คือ recovery key ไม่ตรง; 503 หมายถึง Backend/DB ยังไม่พร้อม. อย่าสร้างบัญชีใหม่หรือเปลี่ยนชื่อฐานข้อมูลเพื่อหลบข้อผิดพลาด

## วิธีทดสอบหลัง Deploy
- เปิด `/ping` และ `/health-ready` ของ Backend ก่อน
- หน้า `/adminnakub`: กรอก recovery key จาก Backend (ไม่ใช่ JWT_SECRET); ถ้ามีเจ้าของระบบเพียง 1 บัญชีสามารถเว้น Username เดิมได้ ส่วนระบบที่มีเจ้าของหลายบัญชีต้องระบุชื่อเดิม
- เข้าสู่ระบบด้วย Username ใหม่ ทดสอบการเพิ่ม/แก้ไข/ลบข้อมูลด้วยข้อมูลทดลองเพียงหนึ่งรายการในแต่ละเมนูที่สิทธิ์อนุญาต และตรวจว่า Refresh แล้วยังอยู่
- หากผิดพลาด เปิด Render Backend Logs ณ เวลาที่กดบันทึก และจด HTTP status/code จาก Network tab (ไม่ส่งรหัสผ่านหรือค่า .env)

คำเตือน: ผู้ใช้เคยส่งรหัสผ่าน Atlas ผ่านแชท ให้เปลี่ยนรหัสผ่าน Database User ที่ Atlas และอัปเดต Environment บน Render ใหม่ อย่าแชร์รหัสนั้นอีก
