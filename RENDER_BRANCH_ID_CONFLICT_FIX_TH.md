# Render / MongoDB code 40: branch_id update conflict

แก้ที่ `backend/server.js` ใน `ensureIndexes()` เฉพาะการสร้างรายการสต็อกเริ่มต้น: เอา `...branch` และ `item_type` ออกจาก `$setOnInsert` เพราะ `branch_id` ถูกเขียนโดย `$set` อยู่แล้ว ส่วน `branch_id` และ `item_type` ได้จากเงื่อนไข upsert. เก็บเฉพาะค่าเริ่มต้นสต็อกใน `$setOnInsert` เพื่อไม่เขียนทับยอดสต็อกเดิม.

ไม่ลบข้อมูล ไม่ลบดัชนีเพิ่ม ไม่แก้ระบบสิทธิ์หรือรหัสผ่าน. ให้ Deploy **Backend** ใหม่ และทดสอบ `https://fleetflow-xkuk.onrender.com/health-ready` จากนั้นลอง Login / Admin Recovery และบันทึกรายการทดสอบ.

ข้อความ IndexKeySpecsConflict code 86 เก่าอาจยังอยู่ใน Logs ย้อนหลัง; ต้องตรวจ logs หลัง Deploy ใหม่ หากยังขึ้น `branch_id` code 40 โปรดส่ง Logs ล่าสุดพร้อมเวลามาอีกครั้ง.
