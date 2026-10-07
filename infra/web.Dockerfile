# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable

# Dependencias: solo manifiestos + store de pnpm en caché (ver api.Dockerfile).
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store \
      --filter @ppg/web --filter @ppg/shared

# Build: código fuente + caché de Next (`.next/cache`) para builds incrementales.
FROM deps AS build
ARG API_TARGET=http://localhost:3001
ENV API_TARGET=$API_TARGET
COPY packages ./packages
COPY apps/web ./apps/web
RUN --mount=type=cache,id=next-cache,target=/app/apps/web/.next/cache \
    pnpm --filter @ppg/shared build \
 && pnpm --filter @ppg/web build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
