# FleetFlow — ใบวางบิลตามผู้จ่ายค่าแรง + Performance Update

อัปเดตวันที่: 26/09/2026

## 1. ระบบใบวางบิลใหม่
- เพิ่มหน้า “ใบวางบิล” สำหรับ Admin/Owner
- ใช้ข้อมูลจากช่อง `ผู้จ่ายค่าแรง (wage_payer)` ในแต่ละเที่ยวงาน
- รวมยอดแยกตามผู้จ่ายค่าแรงอัตโนมัติ
- เลือกช่วงได้: 1–7, 1–15, 16–สิ้นเดือน, ทั้งเดือน หรือกำหนดเอง
- แสดงจำนวนเที่ยว, ทะเบียน, คนขับ, วัสดุ, เส้นทาง, รายได้ต่อเที่ยว
- แยกยอดจ่ายแล้ว / รอจ่าย / ยอดวางบิลรวม
- พิมพ์หรือ Save as PDF ได้จาก Browser
- ไม่สร้างยอดซ้ำและไม่แก้ไขข้อมูลเที่ยวงานต้นฉบับ

## 2. API ใหม่
`GET /billing/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`

Response จะมี:
- total
- payers
- items

## 3. MongoDB
- ใช้ข้อมูล deliveries / jobs เดิม
- เพิ่ม compatible index สำหรับ branch + work_date + jobs.wage_payer
- ไม่ต้องลบข้อมูลเดิม
- ไม่ต้อง migrate ค่า wage_payer เดิม

## 4. ความเร็วระบบ
- MongoDB connection pool อุ่นตั้งแต่ Backend start
- การตรวจ index และ migration legacy ทำ background หลัง connect แล้ว
- Login ไม่ต้องรอ maintenance/index migration ให้เสร็จ
- Login response ส่งข้อมูลสาขากลับมาด้วย ลด round trip
- Frontend cache user + branch เพื่อเปิด shell ได้ไวขึ้นเมื่อ reload
- หาก Render/Mongo cold start ชั่วคราว ระบบไม่ล้าง session ทันทีจาก network error

## หมายเหตุ
หาก Render plan มีการ sleep/cold start ยังอาจมีเวลารอจาก infrastructure ได้ แต่โค้ดรอบนี้ลดเวลารอที่เกิดจากระบบเองลงแล้ว
