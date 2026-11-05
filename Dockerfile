FROM oven/bun:1.3.14 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN bun install --frozen-lockfile

COPY packages packages
COPY backend backend
COPY frontend frontend
RUN cd frontend && bun run build


FROM oven/bun:1.3.14-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8000 \
    UPLOAD_DIR=/tmp/weld-uploads

COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN bun install --frozen-lockfile --production

COPY packages packages
COPY backend backend
COPY --from=build /app/frontend/dist frontend/dist

USER bun
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s CMD-SHELL bun -e "fetch('http://127.0.0.1:8000/api/v1/health').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["bun", "backend/src/index.ts"]
