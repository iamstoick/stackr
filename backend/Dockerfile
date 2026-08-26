# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Production dependencies only; the API is plain ESM with no build step.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATIONS_DIR=/app/database/migrations
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY docker-healthcheck.js ./
COPY src ./src

# Migrations are mounted read-only by compose at /app/database/migrations, but
# the directory must exist for the resolved path to be valid without a mount.
RUN mkdir -p /app/database/migrations && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
