# syntax=docker/dockerfile:1.7

# Debian rather than Alpine on purpose: better-sqlite3 is a native addon and
# ships prebuilt binaries for glibc. On musl it has to compile from source,
# which means a C++ toolchain in the image and a build that breaks whenever the
# prebuild matrix changes. The size difference is not worth that.
ARG NODE_VERSION=22-bookworm-slim

# ---- deps --------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# The Prisma CLI tries to fetch a schema engine on install. Nothing in this
# image needs it — the client is pure TypeScript and migrations run through
# scripts/migrate.mjs — so skip it and keep the build off a third-party host.
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --no-fund
# better-sqlite3 is the one dependency that genuinely needs its install script.
RUN npm rebuild better-sqlite3

# ---- build -------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Freeze the workspace defaults into JSON so the runtime needs no TypeScript.
RUN npx tsx scripts/export-defaults.ts
# next build reads AUTH_SECRET through middleware only at request time, but the
# build still wants the env to exist for any statically analysed route.
ENV AUTH_SECRET=build-time-placeholder-not-used-at-runtime-0000
RUN npm run build

# ---- runtime -----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/app.db

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Next's standalone output carries its own minimal node_modules, so the runtime
# image does not contain the build toolchain, the Prisma CLI, or TypeScript.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# The pieces the standalone trace cannot know about: migrations are data, and
# the boot scripts are invoked by the shell rather than imported by the app.
COPY --from=build /app/prisma/migrations ./prisma/migrations
COPY --from=build /app/prisma/seed.json ./prisma/seed.json
COPY --from=build /app/scripts/migrate.mjs /app/scripts/seed.mjs /app/scripts/create-user.mjs /app/scripts/ensure-admin.mjs ./scripts/
COPY --from=build /app/scripts/lib ./scripts/lib
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh

# better-sqlite3 is used directly by the boot scripts, not only through Prisma,
# so it has to be present outside the standalone trace too.
COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps /app/node_modules/bindings ./node_modules/bindings
COPY --from=deps /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# The volume is owned by the app user, not root: a container that writes its
# database as root leaves a volume nobody else can back up or restore.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
