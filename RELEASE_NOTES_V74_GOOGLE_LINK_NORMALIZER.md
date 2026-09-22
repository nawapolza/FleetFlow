# V74 Google Maps Link Normalizer

- แก้ข้อผิดพลาด “รองรับเฉพาะลิงก์ HTTPS จาก Google Maps เท่านั้น”
- ดึง URL ออกจากข้อความแชร์ที่มีชื่อสถานที่หรือข้อความอื่นติดมาด้วย
- เติม `https://` และอัปเกรด `http://` เป็น HTTPS อัตโนมัติ
- รองรับ `maps.app.goo.gl`, `goo.gl/maps`, `google.com/maps` และโดเมน Google ประเทศต่าง ๆ
- รองรับ Android Intent, `google.navigation:` และ `geo:` links
- อ่าน Browser Fallback URL จาก Intent และข้ามหน้าคำยินยอมของ Google เมื่อมี continue URL
- ลิงก์ Google Maps แบบเต็มที่มีพิกัดอยู่แล้วไม่ต้องเรียกเครือข่ายเพื่อขยายลิงก์
- ปรับข้อความผิดพลาดให้บอกวิธีแก้ที่ตรงกับสาเหตุ
