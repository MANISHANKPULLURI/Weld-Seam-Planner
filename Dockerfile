# Weld Seam Planner — single self-contained image.
# One Bun process serves the API and the built SPA
# (see backend/src/index.ts), so there is deliberately
# only ONE image: no separate frontend/backend images,
# no compose stack, nothing else to deploy alongside it.
#
#   docker build -t weld-planner .
#   docker run -p 8000:8000 -e MAX_FILE_MB=500 weld-planner
#
# Requires BuildKit (default on Docker 23+ and
# fly.io remote builders) for the cache mounts that
# make rebuilds fast and network-light.

# ------------------------------------------------------------
# Build stage: full install, then compile the SPA.
# ------------------------------------------------------------
FROM oven/bun:1.3.14 AS build

WORKDIR /app

# Manifests first, so dependency layers cache
# independently of source changes.
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# Full install (devDeps needed: vite build runs here).
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY packages packages
COPY backend backend
COPY frontend frontend

RUN cd frontend && bun run build


# ------------------------------------------------------------
# Runtime stage: production deps + prebuilt SPA only.
# ------------------------------------------------------------
FROM oven/bun:1.3.14-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000
ENV UPLOAD_DIR=/tmp/weld-uploads

LABEL org.opencontainers.image.title="Armatrix Weld Seam Planner"
LABEL org.opencontainers.image.description="Upload an STL, plan weld seams, export a robot-ready weld job. Single-process image: Bun API plus static SPA."

# Production-only install.
# No devDeps, no build tools in the final image.
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

# App source (tests excluded via .dockerignore).
COPY packages packages
COPY backend backend

# Prebuilt SPA from the build stage.
COPY --from=build /app/frontend/dist frontend/dist

# Writable upload scratch for chunked STL uploads.
# The backend also creates this directory on boot.
RUN mkdir -p /tmp/weld-uploads
RUN chown bun:root /tmp/weld-uploads

USER bun

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD ["bun", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||'8000')+'/api/v1/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["bun", "backend/src/index.ts"]
