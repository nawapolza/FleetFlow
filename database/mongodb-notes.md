# MongoDB Collections

ระบบ v4 ใช้ฐานข้อมูลเดิม `oil_management_system` และ collections ดังนี้

| Collection | ใช้ทำอะไร |
|---|---|
| users | ผู้ใช้ owner / employee |
| vehicles | รถ ทะเบียนรถ คนขับ |
| deliveries | รายการทำน้ำมันบรรทุก / รายการเติมน้ำมัน |
| stocks | ยอดคงเหลือของ ดีเซล / น้ำมันเครื่อง / แอดบลู |
| stock_movements | ประวัติเติมสต๊อก ปรับสต๊อก และหักสต๊อกจากงานบรรทุก |
| notifications | แจ้งเตือนอัตโนมัติ |

> เวอร์ชันนี้เปลี่ยนให้ใช้ `stock_movements` ตามชื่อ collection ที่เห็นใน MongoDB เดิม แต่ยังอ่านข้อมูล legacy จาก `stock_transactions` ได้ถ้ามีข้อมูลเก่าหลงเหลืออยู่

## ประเภทน้ำมันที่อนุญาต

- ดีเซล
- น้ำมันเครื่อง
- แอดบลู

ระบบตัดเบนซิน / แก๊สโซฮอล์ออกแล้ว
