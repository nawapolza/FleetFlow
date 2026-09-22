# testsystem v1 — Transport Ledger

React + Vite + Tailwind CSS frontend and Node.js + Express + MongoDB backend, separated for Render deployment.

## Installation (Windows)

Requirements: Node.js 22+, MongoDB Atlas or local MongoDB. In each folder separately:

```powershell
cd backend
copy .env.example .env
npm install
npm start
```

Edit backend/.env first: set MONGO_URI, JWT_SECRET (32+ random characters), CLIENT_ORIGIN=http://localhost:5173. In a second terminal:

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Frontend: http://localhost:5173 ; backend: http://localhost:4000/api/health. The initial setup screen registers an admin username (3–40 characters, a-z 0-9 _ . -), email and password (12+ characters). Subsequent login accepts username/password. Existing FleetFlow accounts can log in with their **email in the username box**, then an admin can set a username under Users > Edit. Do not delete the existing MongoDB data or run setup again for an existing database.

## Render — two separate services

Push the parent directory (containing frontend/ and backend/) to GitHub. Backend: Web Service, root directory `backend`, build `npm install`, start `npm start`. Backend environment: MONGO_URI, JWT_SECRET (32+ random characters), CLIENT_ORIGIN=https://YOUR-FRONTEND.onrender.com, NODE_ENV=production. Frontend: Static Site, root directory `frontend`, build `npm install && npm run build`, publish `dist`, environment VITE_API_URL=https://YOUR-BACKEND.onrender.com. Add a rewrite `/*` to `/index.html` for frontend client routes if needed. Never commit `.env` files, database credentials, or JWT_SECRET.

## Functionality

Dashboard per month and vehicle; vehicle CRUD (deletion blocked when linked to jobs or expenses); transport job CRUD; expense CRUD; per-vehicle/month revenue, received payments, outstanding, cost, cash flow and profit; CSV exports. Admin manages user creation, edits (including optional password reset), deletion (cannot delete own account / last admin). Staff cannot delete data. Existing records are read from MongoDB; no fictitious business records are loaded.

## Important notes

The UI has responsive card layouts for mobile and a wide table layout on desktop; form controls avoid mobile viewport clipping. Username is lowercase and case-insensitive. Upgrading an existing FleetFlow database does not automatically create usernames for old accounts: login with email first and add each username in the user editor. Duplicate usernames/emails are rejected by MongoDB indexes. Back up your database before deploying a new version. If Render MongoDB connection fails, configure Atlas Network Access to include Render's outbound IP ranges and verify the connection string and user permissions; do not disable TLS verification.

## Verification

Backend syntax check and 4 accounting unit tests passed in the packaging environment. Frontend production build and live Render/MongoDB integration were **not** verified in this environment; run `npm run build` in frontend and test in your own staging deployment before replacing the live service.
