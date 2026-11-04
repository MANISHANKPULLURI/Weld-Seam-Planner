FROM oven/bun:1.3.14 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN bun install --frozen-lockfile

COPY backend backend
COPY frontend frontend
RUN cd frontend && bun run build


FROM oven/bun:1.3.14-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8000 \
    UPLOAD_DIR=/tmp/weld-uploads

COPY package.json bun.lock ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN bun install --frozen-lockfile --production

COPY backend backend
COPY --from=build /app/frontend/dist frontend/dist

USER bun
EXPOSE 8000
CMD ["bun", "backend/src/index.ts"]
