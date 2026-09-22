# Git-ready commands

หลังนำไฟล์เวอร์ชันนี้ไปวางในโฟลเดอร์ Repository เดิม:

```bash
git status
git add frontend/index.html frontend/package.json frontend/package-lock.json \
  frontend/src/components/Layout.jsx frontend/src/index.css \
  frontend/src/pages/StockPage.jsx frontend/src/pages/UsersPage.jsx \
  package.json package-lock.json MOBILE_UX_V45.md GIT_READY.md
git commit -m "feat: redesign responsive mobile UX v45"
git push origin main
```

หากแตก ZIP เป็นโปรเจกต์ใหม่และยังไม่มี Git:

```bash
git init
git branch -M main
git add .
git commit -m "feat: mobile UX v45"
git remote add origin https://github.com/nawapolza/heng-charoen-phuetphon-fuel-system.git
git push -u origin main
```

> ตรวจสอบ URL ของ Repository ก่อนใช้คำสั่ง `git remote add origin`
