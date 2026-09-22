# FleetFlow / Test System — แก้ไขบัญชีผู้ใช้และธีมแดงขาว

- Backend ตรวจสอบดัชนี users.email_1 ที่เป็น unique แบบเก่าและลบทิ้งเมื่อเริ่มระบบ เพื่อให้สร้างบัญชี Username/Password โดยไม่มี email ได้หลายบัญชี; คง unique username ตามเดิม
- การเพิ่มบัญชีในเมนูพนักงานไม่ต้องกรอกสาขา ระบบใช้สาขาที่ผู้ดูแลเลือกอยู่ในขณะสร้างบัญชี เมื่อเข้าสู่ระบบพนักงานจะเห็นเฉพาะสาขาที่ได้รับมอบหมาย ผู้ดูแลแก้สาขาภายหลังได้ (ไม่เปิดให้พนักงานเลือกสาขาอื่นได้เอง เพราะเป็นการข้ามสิทธิ์ข้อมูล)
- หน้า /adminnakub เปลี่ยนเป็นสีแดงขาว และเพิ่มการไล่สีและระยะห่างในหน้าฟอร์ม/บัญชี/ใบสรุปงาน

## Deploy
1. สำรองข้อมูล MongoDB Atlas ก่อนเปลี่ยนโค้ดและดัชนี
2. Push โค้ดและ Deploy Backend เวอร์ชันนี้ก่อน การแก้ดัชนี email_1 ทำงานเมื่อ Backend เริ่มเชื่อม MongoDB
3. Deploy Frontend Static Site ใหม่ Root Directory: frontend, Publish Directory: dist, Rewrite: /* -> /index.html
4. ทดสอบสร้างผู้ใช้ 2 บัญชีโดยไม่กรอก email และทดลอง Login ทดสอบสิทธิ์การเห็นข้อมูลต่างสาขา
5. ตรวจสอบ Render logs ว่ามีข้อความ [users] Removed legacy unique email_1 index เมื่อพบดัชนีเก่า
6. ไม่ใส่ .env หรือ credential ใน GitHub/ZIP ใช้ Environment ของ Render

ถ้า MongoDB user ของคุณไม่มีสิทธิ์ dropIndex ให้ผู้ดูแลฐานข้อมูลลบดัชนี email_1 ของ collection test.users ผ่าน Atlas Indexes หลังตรวจสอบให้แน่ใจว่าเป็น unique email legacy เท่านั้น ห้ามลบ _id_ หรือ username_1
