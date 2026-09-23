# ขวัญใจดาวทองขนส่ง — โลโก้ล่าสุด + คู่มือแก้ Render Build

## โลโก้
ใช้ภาพที่เจ้าของระบบแนบมาโดยตรงแทน `frontend/public/kwanjai-logo.png` โดยไม่ตกแต่งภาพต้นฉบับ ไอคอนหน้าจอหลักขนาด 192/512 พิกเซลย่อขนาดมาจากภาพเดียวกัน หน้า Login, Home, Loading, แถบเมนู และใบสรุปงานอ้างอิงไฟล์โลโก้นี้

## Render Static Site
Root Directory: `frontend`
Build Command: `npm ci --include=dev --no-audit --no-fund && npm run build`
Publish Directory: `dist`
Rewrite: Source `/*` -> Destination `/index.html` (Rewrite)

## การวิเคราะห์ Build failed
ข้อความ `at ArrayExpression.bind` และ `at VariableDeclarator.bind` เป็น stack trace ของ Rollup ไม่ใช่ข้อความต้นเหตุ; ต้องดูบรรทัดแรกที่ขึ้น `error during build`, `[vite]: Rollup failed ...` หรือชื่อไฟล์/line ก่อน stack trace เพื่อแก้ปัญหาได้อย่างถูกต้อง

การตรวจแบบ static ยืนยันว่าไฟล์ JS/JSX ผ่านการ parse แต่ไม่เท่ากับการ Build สำเร็จ การติดตั้ง dependencies ในสภาพแวดล้อมสร้างไฟล์ครั้งนี้ไม่สำเร็จ จึงไม่สามารถรับรองว่า Deploy ผ่าน Render ได้ จนกว่าจะได้รับ Build Log ส่วนแรกและรันทดสอบ build ได้

## ความปลอดภัย
อย่านำ `backend/.env` ที่มี MONGODB_URI, JWT_SECRET, ADMIN_RECOVERY_KEY ขึ้น GitHub; ใช้ Environment Variables ของ Render แทน
