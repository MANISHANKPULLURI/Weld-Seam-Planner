import { describe, expect, test } from "bun:test";
import { app } from "../src/index.ts";

describe("GET /api/v1/health", () => {
  test("returns 200 with status ok", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("returns json content-type", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  test("handles repeated calls", async () => {
    const results = await Promise.all([
      app.request("/api/v1/health"),
      app.request("/api/v1/health"),
      app.request("/api/v1/health"),
    ]);
    for (const r of results) expect(r.status).toBe(200);
  });

  test("rejects POST to health", async () => {
    const res = await app.request("/api/v1/health", { method: "POST" });
    expect([404, 405]).toContain(res.status);
  });

  test("returns 404 for unknown route", async () => {
    const res = await app.request("/api/v1/unknown");
    expect(res.status).toBe(404);
  });

  test("response is valid json shape", async () => {
    const res = await app.request("/api/v1/health");
    const body = await res.json() as { status: string };
    expect(typeof body.status).toBe("string");
    expect(body.status).toBe("ok");
  });
});
