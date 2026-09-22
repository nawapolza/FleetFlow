FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package*.json ./

RUN pnpm install --prod --frozen-lockfile=false
RUN node -e "require('express'); require('dotenv'); require('cors'); require('mongodb'); require('socket.io'); console.log('✅ backend dependencies ok')"

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
