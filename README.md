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

## v1.1 — manually recorded kilometers and monthly fuel rate

- Transport Jobs: enter **distanceKm** (the total distance in km for that job, entered manually; leave blank for unknown). Existing job records remain in the database and have no made-up distance.
- Fuel Expenses: for the `fuel` category, enter **fuelLiters** (liters purchased); other expense categories do not count as fuel.
- Monthly reports: select a month and optional vehicle. Each plate shows summed manually entered kilometers, purchased liters, km/liter, fuel cost and baht/km; the top cards show the selected fleet/month totals. Job and expense CSV exports include new fields; the per-vehicle/month CSV includes fuel and distance statistics.
- **Definition**: monthly km/l = sum of job distances in the month / liters purchased in the month, not an exact fuel-consumption measurement. Fuel purchased in one month may be used in another. Ratio is displayed only if every job in the selected period has a recorded distance, every fuel expense has a recorded liter quantity, there is at least one job and fuel expense, and denominator is greater than zero. Otherwise the ratio is shown as unavailable. Historical missing inputs are not estimated.
- Editing or deleting a job or fuel expense recalculates the report from the persisted MongoDB records. The data store retains the existing models and adds optional fields; no destructive migration is required. Make a database backup before updating a deployed service.

### Updating the existing Render deployment

Unzip and copy **frontend/** and **backend/** from this version into the *existing cloned GitHub repository* (preserve its `.git/` folder). Verify `.env` files have not been added, then run `git add frontend backend README.md`, `git commit -m "Add monthly distance and fuel rate"`, `git push origin main`. Backend Render Web Service: root `backend`, build `npm install`, start `npm start`. Frontend Static Site: root `frontend`, build `npm install && npm run build`, publish `dist`. Keep `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`, and `VITE_API_URL` in service Environment Variables. If database access is still blocked by Atlas Network Access or TLS, the new version alone will not fix that connection problem.

### Verification of v1.1

Backend syntax and seven logic tests verified in the packaging environment. Frontend JSX parsed without syntax diagnostics using TypeScript's parser; **full Vite production build, live MongoDB, Render and phone-browser testing are not verified here** because npm dependencies were unavailable in the packaging environment. Run `npm run build` in `frontend` and test on a staging service before replacing your production deployment.
