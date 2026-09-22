# FleetFlow — frontend / backend แยก Deploy บน Render

โครงสร้างโปรเจกต์นี้แยกแอปเว็บ React/Vite/Tailwind CSS และ API Node.js/Express/MongoDB อย่างชัดเจน แต่ละโฟลเดอร์มี `package.json`, คำสั่งติดตั้ง และตัวแปรสภาพแวดล้อมของตัวเอง ไม่ต้อง `npm install` จากโฟลเดอร์รวม

```text
FleetFlow_Render_Separated/
├── frontend/
│   ├── src/App.jsx
│   ├── src/main.jsx
│   ├── src/index.css
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.example
│   └── static.json
├── backend/
│   ├── src/index.js
│   ├── src/models.js
│   ├── src/logic.js
│   ├── tests/logic.test.js
│   ├── package.json
│   └── .env.example
└── README.md
```

## รันบน Windows (แยกเทอร์มินัล)

ต้องมี Node.js 22+, MongoDB Local หรือ MongoDB Atlas, และ npm; ติดตั้งแพ็กเกจแต่ละฝั่งจากอินเทอร์เน็ตก่อนใช้งาน

เทอร์มินัลที่หนึ่ง: `cd backend` → คัดลอก `.env.example` เป็น `.env` → กำหนด `MONGO_URI`, `JWT_SECRET` (สุ่มอย่างน้อย 32 ตัวอักษร) และ `CLIENT_ORIGIN=http://localhost:5173` → `npm install` → `npm run dev`

เทอร์มินัลที่สอง: `cd frontend` → คัดลอก `.env.example` เป็น `.env` → ให้ `VITE_API_URL=http://localhost:4000` → `npm install` → `npm run dev` → เปิด http://localhost:5173

ใน localhost API จะทำงานที่ http://localhost:4000/api/health; health/database = connected เมื่อเชื่อม MongoDB ได้แล้ว

## Deploy Render — แยก 2 services จาก Git repository เดียวกัน

1. อัปโหลดโฟลเดอร์ `frontend` และ `backend` พร้อม README นี้ไป Git repository ส่วนตัว **อย่า commit ไฟล์ .env**
2. ตั้ง MongoDB Atlas: สร้าง database user, ตั้งค่าการเชื่อมต่อและ network access อย่างจำกัด; เก็บ connection string เป็น secret ของ Backend ไม่เก็บใน Frontend
3. สร้าง Render **Web Service** สำหรับ backend: Root Directory=`backend`, Runtime=Node, Build Command=`npm ci` หากมี package-lock.json มิฉะนั้น `npm install`, Start Command=`npm start`. ตั้ง `NODE_ENV=production`, `MONGO_URI=<Atlas URI>`, `JWT_SECRET=<random secret >=32 chars>`, `CLIENT_ORIGIN=https://<frontend-name>.onrender.com` (ไม่มี / ท้าย URL). Render จะกำหนด `PORT` เอง; ไม่ต้องตั้งเอง. หลัง deploy ตรวจ URL `/api/health`.
4. สร้าง Render **Static Site** สำหรับ frontend: Root Directory=`frontend`, Build Command=`npm ci && npm run build` เมื่อมี package-lock.json มิฉะนั้น `npm install && npm run build`, Publish Directory=`dist`; Environment Variable `VITE_API_URL=https://<backend-name>.onrender.com` (ไม่มี / ท้าย URL). กำหนด rewrite `/*` -> `/index.html` ถ้าใช้ URL ภายในแบบ client-side routing ในอนาคต. Deploy ใหม่ทุกครั้งที่เปลี่ยน VITE_API_URL เพราะค่านี้ถูกฝังตอน build.
5. ถ้า Render ให้ URL ที่ต่างจากค่าตั้งต้น ให้แก้ `CLIENT_ORIGIN` ใน backend ให้ตรงกับ URL จริงของ frontend (รวม https://) แล้ว redeploy backend; URL API ที่ frontend ต้องตรงกับ backend URL จริง.

**ข้อควรทราบเรื่องล็อกอิน:** เพื่อให้สองบริการคนละโดเมนทำงานร่วมกันโดยไม่พึ่ง third-party cookies เวอร์ชันนี้ส่ง JWT ผ่าน `Authorization: Bearer` และเก็บ token ชั่วคราวใน `sessionStorage` ของแท็บที่ล็อกอิน ปิดแท็บแล้วต้องล็อกอินใหม่; `Logout` ลบ token ในแท็บ แต่ JWT ที่ออกไปแล้วจะใช้ได้จนหมดอายุ 7 วัน ไม่ใช่การเพิกถอน token ฝั่ง server. หลีกเลี่ยงสคริปต์ภายนอกที่ไม่น่าเชื่อถือ, ใช้ HTTPS เท่านั้นในการใช้งานจริง, เพิ่ม CSRF/XSS/security monitoring, backup และทำ security review ก่อนใช้งานกับข้อมูลธุรกิจสำคัญ.

**การเริ่มระบบครั้งแรก:** ถ้าฐานข้อมูลยังไม่มีผู้ใช้งาน หน้าเว็บจะให้สร้างผู้ดูแลคนแรก อย่าเปิด public backend URL นาน ๆ ก่อนตั้งค่าผู้ดูแลแล้ว; จำกัดการเข้าถึงขณะติดตั้งจริง. Backend ปัจจุบันใช้การเช็กจำนวนผู้ใช้ก่อน setup ซึ่งควรเพิ่มกลไก bootstrap/admin invitation ก่อนเปิดให้บุคคลทั่วไปใช้งาน.

## ข้อมูลและการคำนวณ

MongoDB เก็บข้อมูลรถ งานขนส่งและค่าใช้จ่ายที่กรอกเอง ไม่เติมข้อมูลสมมติ; มีค่าใช้จ่ายประเภท น้ำมัน อะไหล่ ค่าแรงช่าง ค่ายาง ค่าแรงคนขับ ค่าทางด่วน และอื่น ๆ; รายงานแยกยอดเรียกเก็บ เงินรับจริง ยอดค้างรับ และรายรถ/รายเดือน. สูตรรายงานเป็นรายงานบริหารเบื้องต้น ไม่ใช่งบการเงินที่ผ่านการรับรอง และเงินรับจริงของงานหนึ่งรายการไม่ได้มีประวัติวันที่รับเงินแต่ละงวด.

## คำสั่งทดสอบ

`cd backend && npm test` และ `cd frontend && npm run build` (ต้องติดตั้ง dependencies ก่อน) รวมทั้งลองเพิ่มข้อมูลจริงผ่าน UI, ตรวจ MongoDB, login/logout, และทดสอบบนจอมือถือก่อนเปิดใช้งาน.
"# FleetFlow" 
