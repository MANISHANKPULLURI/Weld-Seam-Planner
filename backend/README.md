# backend

Bun + Hono API for the Weld Seam Planner.

```bash
bun install
cp .env.example .env
bun run dev        # hot reload
bun test           # API, orientation and upload-security tests
bun run check      # typecheck
```

In production the same process also serves `frontend/dist` (see the root `Dockerfile`).
