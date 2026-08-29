FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
COPY apps/bot/package.json apps/bot/
RUN npm ci

COPY . .
RUN npm run db:generate

# tsx ejecuta el TypeScript directamente; no hay paso de build para el bot.
CMD ["npm", "run", "start", "--workspace", "apps/bot"]
