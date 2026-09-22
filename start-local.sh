#!/usr/bin/env sh
set -eu
if [ ! -f backend/.env ]; then
  echo "Missing backend/.env. Copy backend/.env.example to backend/.env and set MONGODB_URI/JWT_SECRET."
  exit 1
fi
(cd backend && npm run dev) &
BACK_PID=$!
(cd frontend && npm run dev) &
FRONT_PID=$!
trap 'kill "$BACK_PID" "$FRONT_PID" 2>/dev/null || true' INT TERM EXIT
wait
