# UX/UI V47 — HENG CONTROL DECK

เวอร์ชันนี้ออกแบบหน้าตาระบบใหม่ในแนว **Operational Control Deck** โดยคงฟังก์ชันและข้อมูลเดิมไว้ แต่เปลี่ยนภาษาภาพ โครงนำทาง และประสบการณ์ใช้งานให้แตกต่างจากระบบสำเร็จรูปทั่วไปอย่างชัดเจน

## จุดที่เปลี่ยนหลัก

- เปลี่ยน Layout หลักใหม่ทั้งหมด: Desktop Route Rail, Sticky Context Bar และ Mobile Floating Dock
- เพิ่มเมนูมือถือแบบ Bottom Sheet พร้อมการจัดการ Focus, Escape key และล็อกการเลื่อนพื้นหลัง
- สร้าง Popup หลังบันทึกสำเร็จใหม่ พร้อมวงโคจร สัญลักษณ์ยืนยัน Scan line และ Progress timer
- ปรับ Dashboard, ฟอร์มบันทึก, รายการย้อนหลัง, สต๊อก, รถ, พนักงาน, แจ้งเตือน และ Login ให้ใช้ Design System เดียวกัน
- ปรับ Card, Table, Input, Select, Button, Badge, Modal, Loading และสถานะต่าง ๆ ใหม่ทั้งระบบ
- เพิ่ม Breakpoint สำหรับมือถือขนาดเล็ก มือถือทั่วไป แท็บเล็ต โน้ตบุ๊ก และจอ Desktop
- คง Print layout และใบสรุปไว้ เพื่อไม่ให้การพิมพ์เอกสารถูกกระทบ
- เพิ่ม Touch target และ Safe-area สำหรับมือถือที่มีแถบ Home indicator

## Popup บันทึกสำเร็จ

ไฟล์หลัก: `frontend/src/utils/alerts.js`

การบันทึกใน `DeliveryForm.jsx` จะรอให้ Popup แสดงครบก่อนดำเนินการต่อ เพื่อให้ผู้ใช้รับรู้สถานะชัดเจน ไม่เกิดความรู้สึกว่ากดแล้วระบบไม่ตอบสนอง

## ไฟล์หลักที่แก้ไข

- `frontend/src/components/Layout.jsx`
- `frontend/src/components/Loading.jsx`
- `frontend/src/components/DeliveryForm.jsx`
- `frontend/src/utils/alerts.js`
- `frontend/src/index.css`
- `frontend/src/pages/DeliveriesPage.jsx`
- `frontend/src/pages/StockPage.jsx`
- `frontend/src/pages/VehiclesPage.jsx`
- `frontend/src/pages/UsersPage.jsx`
- `frontend/src/pages/NotificationsPage.jsx`

## เริ่มใช้งาน

```bash
cd frontend
npm install
npm run dev
```

Build สำหรับใช้งานจริง:

```bash
cd frontend
npm run build
```

> โปรเจกต์กำหนด Node.js 20.x ตามไฟล์ `.nvmrc` และ `.node-version`
