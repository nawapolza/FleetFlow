# Test System: ตั้งค่าหรือกู้บัญชีแอดมิน

1. ตั้ง `MONGODB_URI`, `MONGODB_DB=test`, `PORT=4000`, `JWT_SECRET` และ `ADMIN_RECOVERY_KEY` ใน `backend/.env` หรือ Environment ของ Render โดย `ADMIN_RECOVERY_KEY` ต้องสุ่มเอง ยาวอย่างน้อย 32 ตัว และไม่ซ้ำกับ JWT_SECRET (ห้ามอัปโหลด .env ขึ้น GitHub)
2. ตั้ง `VITE_API_URL=http://localhost:4000/api` ใน `frontend/.env` สำหรับเครื่อง Local (หรือ `/api` เมื่อใช้ Vite proxy ที่ `VITE_DEV_BACKEND_URL=http://localhost:4000`)
3. รัน Backend และ Frontend แล้วเปิด `http://localhost:5173/adminnakub` หาก Deploy ให้เปิด `https://YOUR_FRONTEND_DOMAIN/adminnakub` และตั้ง SPA fallback ให้หน้าเว็บทำงานหลังรีเฟรช URL
4. ถ้ายังไม่มี owner: เว้นช่อง Username แอดมินเดิม กรอก username ใหม่/password ใหม่/รหัสกู้คืนจากเซิร์ฟเวอร์; ถ้ามี owner: ระบุ username แอดมินเดิมด้วย ระบบแก้บัญชีเดิม (ไม่สร้างแอดมินซ้ำ)
5. กลับหน้า Login และเข้าด้วย username/password ที่เพิ่งตั้ง โดยบัญชี role=owner มีสิทธิ์ผู้ดูแลระบบ
6. หลังใช้งานกู้คืน ให้ลบ/เปลี่ยน `ADMIN_RECOVERY_KEY` จาก Backend Environment และรีสตาร์ตเพื่อปิดความสามารถกู้คืนด้วยรหัสเดิม

หมายเหตุ: URL เพียงอย่างเดียวไม่พอสำหรับเปลี่ยนรหัสผ่าน ต้องมีรหัสกู้คืนจากเซิร์ฟเวอร์ที่เจ้าของควบคุม การกู้คืนไม่ลบข้อมูลงานและไม่ลบบัญชีอื่น แต่จะทำให้ token ของบัญชีที่ถูกรีเซ็ตใช้ไม่ได้หลังรีเซ็ต ควรเปลี่ยนรหัส MongoDB ที่เคยแชร์และปิดสิทธิ์ของรหัสเก่าด้วย
