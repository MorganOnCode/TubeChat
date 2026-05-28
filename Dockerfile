# Multi-stage Next.js build for tubechat. Small final image, non-root user,
# no build tools in the runtime layer. Mirrors the hosksaid pattern.

# ----- Stage 1: deps + build -------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs ./
COPY public/ public/
COPY src/ src/

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ----- Stage 2: runtime ------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

# yt-dlp + ffmpeg back the Whisper fallback in src/lib/whisper.ts (used by the
# ingestion scripts / cron route). Cost ~80MB; kept for parity with hosksaid.
RUN apk add --no-cache yt-dlp ffmpeg

RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app

# Next standalone bundles only traced runtime deps; `node server.js` starts it.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public

# For the scheduler profile we run the TS scripts via tsx. Standalone trims
# node_modules to web deps only, so layer the full tree on top (superset).
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json tsconfig.json ./

USER app

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
