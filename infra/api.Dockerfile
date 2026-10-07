# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable

# Dependencias: se copian SOLO los manifiestos. La capa (y el store de pnpm en
# caché) se reutiliza mientras no cambie `pnpm-lock.yaml` ni algún package.json.
# `--ignore-scripts` evita que corran los `prepare` de los paquetes del workspace
# (que compilan y necesitarían el código fuente todavía no copiado).
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store \
      --filter @ppg/api --filter @ppg/db --filter @ppg/shared

# Build: recién aquí el código fuente. Cualquier cambio en `apps/api` sólo
# invalida esta etapa, no la instalación.
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm rebuild \
 && pnpm --filter @ppg/shared build \
 && pnpm --filter @ppg/db build \
 && pnpm --filter @ppg/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Trazabilidad de versión (visible en GET /api/health y en la UI de Respaldos).
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME
# Cliente PostgreSQL 18 para la UI de Respaldos (pg_dump/pg_restore/psql).
RUN apk add --no-cache postgresql18-client
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY infra/api-entrypoint.sh ./entrypoint.sh
EXPOSE 3001
CMD ["sh", "entrypoint.sh"]
