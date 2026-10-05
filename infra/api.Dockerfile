# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --filter @ppg/api --filter @ppg/db --filter @ppg/shared

FROM deps AS build
RUN pnpm --filter @ppg/shared build && pnpm --filter @ppg/db build && pnpm --filter @ppg/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Cliente PostgreSQL 18 para la UI de Respaldos (pg_dump/pg_restore/psql).
RUN apk add --no-cache postgresql18-client
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY infra/api-entrypoint.sh ./entrypoint.sh
EXPOSE 3001
CMD ["sh", "entrypoint.sh"]