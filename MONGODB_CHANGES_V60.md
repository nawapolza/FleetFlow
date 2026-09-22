# MongoDB Changes — V60 Fuel Control

เวอร์ชัน 60 ออกแบบให้ใช้ฐานข้อมูลเดิมได้ทันทีและไม่ลบข้อมูลเก่า เมื่อ Backend เริ่มทำงาน ฟังก์ชัน `ensureIndexes()` จะสร้าง Index และเติมเฉพาะฟิลด์ที่ยังไม่มีโดยอัตโนมัติ

## Collection ใหม่

### `stock_audits`
ใช้เก็บผลตรวจนับน้ำมันจริงเทียบกับยอดในระบบ

ฟิลด์หลัก:

- `item_type` — ดีเซล / น้ำมันเครื่อง / แอดบลู
- `tank_name` — ชื่อถังหรือจุดจ่าย
- `audit_date` — วันที่ตรวจนับ
- `system_balance_liters` — ยอดก่อนตรวจในระบบ
- `actual_balance_liters` — ยอดตรวจจริง
- `variance_liters` — ส่วนต่าง (`ยอดจริง - ยอดระบบ`)
- `note` — หมายเหตุหรือสาเหตุ
- `user_id` — ผู้บันทึก
- `created_at` — เวลาบันทึก

Indexes ที่เพิ่ม:

```js
{ item_type: 1, audit_date: -1 }
{ created_at: -1 }
```

## ฟิลด์ที่เพิ่มใน `stocks`

- `tank_name`
- `capacity_liters`
- `reorder_level_liters`
- `critical_level_liters`
- `available_percent`
- `level_status` — `ready`, `low`, `critical`
- `level_label`
- `last_alert_status`

ค่าเริ่มต้นเมื่อฟิลด์เดิมยังไม่มี:

| ประเภท | ความจุ | จุดสั่งเติม | จุดวิกฤต |
|---|---:|---:|---:|
| ดีเซล | 1,000 ลิตร | 300 ลิตร | 100 ลิตร |
| น้ำมันเครื่อง | 200 ลิตร | 60 ลิตร | 20 ลิตร |
| แอดบลู | 500 ลิตร | 150 ลิตร | 50 ลิตร |

เจ้าของกิจการเปลี่ยนค่าเหล่านี้ได้ที่หน้า **สต๊อกน้ำมัน** โดยไม่ต้องแก้ MongoDB เอง

## ฟิลด์ที่เพิ่มใน `deliveries`

- `actual_filled_liters` — ลิตรเติมจริง
- `standard_fuel_liters` — ลิตรมาตรฐานจากระยะทาง
- `fuel_variance_liters` — ลิตรจริงลบลิตรมาตรฐาน
- `fuel_variance_baht` — มูลค่าส่วนต่าง
- `expected_fuel_cost_baht` — ค่าใช้จ่ายมาตรฐาน
- `actual_fuel_cost_baht` — ค่าใช้จ่ายจริง
- `cost_per_km` — ต้นทุนต่อกิโลเมตร
- `efficiency_status` — `over_standard`, `under_standard`, `on_standard`

ข้อมูลเก่าที่ไม่มีฟิลด์เหล่านี้จะถูกคำนวณย้อนหลังตอนอ่านข้อมูลผ่าน `enrichDelivery()` จึงเปิดใช้งานต่อได้โดยไม่ต้องแก้เอกสารเก่าทั้งหมด

## ฟิลด์เสริมใน `notifications`

- `kind` — เช่น `stock_level`, `stock_audit`
- `item_type`

Index ที่เพิ่ม:

```js
{ kind: 1, item_type: 1, is_read: 1, created_at: -1 }
```

## สิ่งที่ต้องตั้งค่าใน Render / Server

ใช้ชื่อฐานข้อมูลเดิมได้ แค่กำหนด Environment Variables:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
MONGODB_DB=heng_charoen_fuel_system
JWT_SECRET=<long-random-secret>
APP_TIMEZONE=Asia/Bangkok
```

ไม่ต้องสร้าง Collection ใหม่ด้วยมือ MongoDB จะสร้าง `stock_audits` ตอนมีการตรวจนับครั้งแรก และสร้าง Index/ฟิลด์สต๊อกตอน Backend เริ่มทำงาน

## ความปลอดภัย

ไฟล์ `.env.example` ในชุด V60 ถูกล้างรหัสผ่านและ Secret จริงแล้ว หากรหัสผ่าน MongoDB หรือ JWT Secret เคยถูกส่งหรือเก็บไว้ในไฟล์สาธารณะ ควรเปลี่ยนรหัสผ่านผู้ใช้ MongoDB Atlas และสร้าง JWT Secret ใหม่ก่อน Deploy
