# Render Merge Conflict Fix — V58.0.1

แก้ปัญหา `npm error EJSONPARSE` จาก Merge Conflict ที่ค้างอยู่ในไฟล์:

- `backend/package.json`
- `frontend/package.json`

## สิ่งที่แก้ไข

- เลือกเวอร์ชัน V58 และลบ `<<<<<<<`, `=======`, `>>>>>>>` ออกทั้งหมด
- ปรับเวอร์ชัน `package.json` และ `package-lock.json` เป็น `58.0.1`
- เพิ่ม `scripts/verify-project.js` เพื่อตรวจ Merge Conflict และตรวจ JSON
- เพิ่มการตรวจสอบก่อน `npm ci` ใน `render.yaml`
- เก็บระบบรถหนึ่งคันรองรับหลายงานจาก V58 ไว้ครบ

## ตรวจสอบก่อน Push

```bash
npm run verify
git status
git add .
git commit -m "Fix Render merge conflicts V58.0.1"
git push origin main
```

หลัง Push ให้ Render Deploy commit ล่าสุดใหม่ หากยังใช้ cache เก่าให้ Clear build cache แล้ว Deploy อีกครั้ง