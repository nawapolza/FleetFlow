# FleetFlow / TEST SYSTEM — RED WHITE RELEASE

## สิ่งที่แก้ไข

- ออกแบบ layout ใหม่เป็นแถบเมนูแนวนอนบนคอมพิวเตอร์ และเมนูด่วนด้านล่าง + เมนูแบบแผงบนโทรศัพท์ (ไฟล์ `frontend/src/components/Layout.jsx` และ `frontend/src/redesign.css`)
- ใช้สีแดง/ขาวทั่วระบบ รวมถึงหน้าล็อกอิน ฟอร์ม หน้าบัญชีขนส่ง การ์ด ปุ่ม และหน้าต่างแจ้งเตือน
- หน้าคำนวณและบันทึกงานใช้ **ระยะทางที่ผู้ใช้งานกรอกเอง** ไม่แสดงตัวคำนวณ GPS; ค่าใช้จ่าย = จำนวนลิตร × ราคาต่อลิตร และลิตรมาตรฐาน = ระยะทาง ÷ อัตราประจำรถ
- หน้าใบสรุปงานขนส่งบนเว็บและรูป PNG ที่แชร์/ดาวน์โหลด ออกแบบใหม่ในสีแดง/ขาว
- ปรับหน้า Loading พร้อมข้อความ “กรุณารอ”
- ยกเลิกหน้า/เมนูสต็อกน้ำมันและน้ำมันทุกสาขาบน Frontend รวมถึงการ์ดสต็อกใน Dashboard และหน้าคำนวณ **ไม่ได้ลบข้อมูล MongoDB เดิม** และคง API ฝั่ง Backend สำหรับการทำงานเดิมที่เกี่ยวข้อง
- ระบบบัญชีงานขนส่งเดิมยังบันทึกวันที่ วัสดุที่ขน รายได้ น้ำมัน อะไหล่ ค่าแรงช่างซ่อม ค่ายาง และสรุปกำไร/ขาดทุนรายคัน/เดือน
- หน้า Dashboard เลิกเรียก API ทุก 15 วินาที ยังคงโหลดเมื่อเปิดหน้า เปลี่ยนตัวกรอง กดรีเฟรช หรือมี event Realtime
- ฟังก์ชัน GET ใน `frontend/src/api.js` รวม request ที่เหมือนกันและเกิดพร้อมกันไว้เป็นคำขอเดียว; POST/PUT/DELETE ไม่รวม เพื่อไม่ให้ข้อมูลเขียนซ้ำ
- ยังคงหน้า /adminnakub และการตรวจสิทธิ์ Admin ใน Backend เดิม

## ข้อควรทราบ

ระบบใหม่ไม่ได้เปลี่ยนฐานข้อมูลหรือย้ายข้อมูลอัตโนมัติ กรุณาสำรองฐานข้อมูลก่อน Deploy. Backend ยังมี routes แผนที่/สต็อกเดิมเพื่อรองรับข้อมูลและระบบภายใน แต่หน้าผู้ใช้ใหม่จะไม่แสดงเครื่องมือ GPS หรือเมนูสต็อก

## เริ่มใช้งาน

1. ตั้ง `MONGODB_URI`, `MONGODB_DB=test`, `JWT_SECRET` และ `ADMIN_RECOVERY_KEY` ใน Backend Environment ของ Render หรือ `backend/.env` (อย่า Commit ไฟล์ .env)
2. ตั้ง `VITE_API_URL=https://YOUR-BACKEND.onrender.com` (ไม่ต้องเติม /api เพราะ Backend รับ route ที่ /) ใน Frontend Environment ของ Render หรือใช้ URL Local ตามตัวอย่างใน `frontend/.env.example`
3. สร้าง Frontend: `cd frontend && npm ci --include=dev && npm run build` โดย Render Root Directory = `frontend`, Publish Directory = `dist`
4. สำหรับ Render Static Site ให้ตั้ง Rewrite `/*` → `/index.html` แบบ Rewrite เพื่อให้ `/adminnakub` เปิดตรงได้
5. รัน Backend ด้วย `cd backend && npm ci && npm start` และตรวจสอบจาก Browser ว่าการ Login, บันทึก, แก้ไข, ออกรูป PNG และรายงานใช้งานกับข้อมูลจริงได้

**หมายเหตุ:** โค้ดนี้ยังไม่ได้ผ่าน end-to-end browser test กับ MongoDB Atlas/Render จริง จึงควรทดสอบกับฐานข้อมูลทดสอบก่อนใช้กับข้อมูลจริง
