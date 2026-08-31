# syntax=docker/dockerfile:1

# Production image for EasyPanel (or any Docker host). Ships the full
# node_modules rather than a `next build --output standalone` trace: the
# Prisma CLI (needed at boot to run `prisma migrate deploy`) has a deep,
# dynamic dependency tree of its own (e.g. `effect`) that a hand-picked
# subset of node_modules keeps missing pieces of. Simpler and more robust
# to just ship what `npm ci` installed.
#
# Base is Debian slim (glibc), not Alpine: the Prisma CLI's schema-engine
# binary still expects OpenSSL to be present.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: `postinstall` runs `prisma generate`, which needs
# prisma/schema.prisma — not copied into this stage yet.
RUN npm ci --ignore-scripts

FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Neither `prisma generate` nor `next build` open a real database
# connection, but prisma.config.ts and src/lib/env.ts both resolve these
# vars eagerly just to build their config objects, so *something* has to be
# present at build time. These placeholders are never used to connect to
# anything real and don't carry over to the runner stage (each FROM starts
# a fresh environment — real values are injected at container runtime).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
RUN npx prisma generate
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["./docker-entrypoint.sh"]
