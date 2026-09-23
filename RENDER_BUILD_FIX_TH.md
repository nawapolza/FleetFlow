# แก้ปัญหา Render Build: FileBarChart3

ไฟล์ `frontend/src/components/MobileHome.jsx` ใช้ไอคอน `FileBarChart3` ซึ่งไม่มี export ใน lucide-react ที่ติดตั้งในโปรเจกต์ จึงแก้เป็น `BarChart3` ใน import และเมนูรายงานแล้ว

ใช้ภาพโลโก้ต้นฉบับจากผู้ใช้โดยตรงเป็น `frontend/public/kwanjai-logo.png` โดยไม่ดัดแปลงภาพ

## Deploy บน Render

Static Site: Root Directory `frontend`, Build Command `npm ci --include=dev --no-audit --no-fund && npm run build`, Publish Directory `dist`.

หลัง push ให้ Deploy latest commit และตรวจ Build Logs อีกครั้ง หากยังขึ้น error ใหม่ ให้ดูข้อความบรรทัดแรกหลัง `error during build:`.

**สถานะ:** แก้จุดที่ Build Logs ระบุแล้ว แต่ไม่ได้รับรองว่าทดสอบ Build/Deploy จริงผ่าน หากยังไม่สามารถติดตั้ง dependencies ได้ในสภาพแวดล้อมทดสอบ
