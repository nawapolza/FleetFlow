# ตั้งค่า Google Maps สำหรับ V65

ระบบรองรับ Google Maps Platform ผ่านฝั่งเซิร์ฟเวอร์ เพื่อไม่เปิดเผย API Key ในหน้าเว็บ

## API ที่ต้องเปิดใน Google Cloud Console

1. Places API (New)
2. Routes API
3. Geocoding API
4. เปิด Billing ให้โปรเจกต์ Google Cloud

## ตั้งค่า

เพิ่ม Environment Variable ใน Render หรือไฟล์ `backend/.env`:

```env
GOOGLE_MAPS_API_KEY=วาง_api_key_ตรงนี้
```

จากนั้น Restart/Deploy ระบบใหม่ หน้า GPS จะแสดงสถานะ `Google Places · Google Routes (Traffic-aware)`

## ความปลอดภัยที่แนะนำ

- จำกัด API Key ด้วย API restrictions ให้ใช้ได้เฉพาะ Places API (New), Routes API และ Geocoding API
- เก็บ Key เฉพาะฝั่ง Backend ห้ามใส่ใน Frontend หรือ commit ลง Git
- ตั้ง Budget Alert และ Quota ใน Google Cloud

หากยังไม่ตั้ง Key ระบบจะใช้ OpenStreetMap/OSRM ทั่วโลกโดยอัตโนมัติ และยังเลือกพิกัดหรือคลิกปักหมุดบนแผนที่ได้
