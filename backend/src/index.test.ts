import { describe, expect, test } from "bun:test";
import { app } from "./index.ts";

describe("GET /api/v1/health", () => {
  test("returns ok", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
