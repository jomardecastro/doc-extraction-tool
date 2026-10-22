# syntax=docker/dockerfile:1
# One image: the Fastify API serving the built React app from /app/public.
# Build:  docker build --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t doc-extraction-tool .
# Run:    docker compose up   (see docker-compose.yml and DEPLOYMENT.md)

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat && npm install -g pnpm@9.12.0
WORKDIR /app

# Install with only the manifests so this layer is reused until a dependency changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter frontend build && pnpm --filter backend build \
 && pnpm --filter backend --prod deploy /out/backend

FROM node:24-alpine AS runner
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
WORKDIR /app
# uid 1001 matches the deploy user on the VPS so a bind-mounted data dir needs no chown.
RUN addgroup -g 1001 app && adduser -u 1001 -G app -D app \
 && mkdir -p /data && chown app:app /data
COPY --from=build --chown=app:app /out/backend/node_modules ./node_modules
COPY --from=build --chown=app:app /app/backend/dist ./dist
COPY --from=build --chown=app:app /app/backend/samples ./samples
COPY --from=build --chown=app:app /app/frontend/dist ./public
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
USER app
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/server.js"]
