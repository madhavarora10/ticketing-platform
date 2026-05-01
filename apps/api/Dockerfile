FROM node:20-alpine AS base
RUN npm install -g pnpm@9.0.0

FROM base AS deps
WORKDIR /app
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/pricing/package.json ./packages/pricing/
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/pricing/node_modules ./packages/pricing/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY packages/database ./packages/database
COPY packages/pricing ./packages/pricing
COPY packages/types ./packages/types
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN /app/node_modules/.bin/tsc

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
EXPOSE 4000
CMD ["node", "dist/main.js"]
