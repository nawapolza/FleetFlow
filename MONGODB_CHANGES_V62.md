# MongoDB Changes V62 — Multi-Branch

เวอร์ชัน **62.0.0** เพิ่มการแยกข้อมูลตามสาขา โดยออกแบบให้ใช้ฐานข้อมูลเดิมต่อได้และไม่ลบประวัติเดิม

## Collection ใหม่: `branches`

ฟิลด์หลัก:

- `name` ชื่อสาขา
- `code` รหัสสาขาแบบไม่ซ้ำ
- `address`, `phone`, `note`
- `is_default` สาขาหลัก
- `is_active` สถานะใช้งาน
- `created_at`, `updated_at`, `deleted_at`

## ฟิลด์สาขาที่เพิ่มในข้อมูลปฏิบัติการ

Collection ต่อไปนี้ใช้ `branch_id`, `branch_code`, `branch_name`:

- `stocks`
- `stock_movements`
- `stock_transactions`
- `stock_audits`
- `deliveries`
- `notifications`
- `vehicles`
- `users`

## Index สำคัญ

- `branches.code` แบบ Unique
- `stocks: { branch_id: 1, item_type: 1 }` แบบ Unique
- Index สำหรับค้นหาตามสาขา/วันที่ในรายการน้ำมัน สต๊อก การตรวจนับ แจ้งเตือน รถ และพนักงาน

ระบบจะพยายามลบ Index เก่า `stocks.item_type_1` ก่อนสร้าง Compound Index ใหม่

## Migration อัตโนมัติ

เมื่อ Backend เชื่อม MongoDB:

1. สร้างสาขา `สำนักงานใหญ่` รหัส `HQ` หากยังไม่มีสาขาใช้งาน
2. เติมข้อมูลสาขา HQ ให้เอกสารเดิมที่ไม่มี `branch_id`
3. รักษายอดคงเหลือและประวัติเดิมทั้งหมด
4. สร้างสต๊อกเริ่มต้นที่ขาดให้ครบ 3 ประเภทต่อสาขา
5. เติมค่าตั้งต้นถัง/จุดเตือนเฉพาะฟิลด์ที่ยังไม่มี

การปิดสาขาเป็น Soft Delete จึงไม่ลบรายการย้อนหลังหรือหลักฐานบัญชี และสามารถเปิดใช้งานสาขาเดิมอีกครั้งได้
