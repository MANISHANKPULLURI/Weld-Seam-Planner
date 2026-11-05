import { describe, expect, test } from "bun:test";
import { app } from "../src/index.ts";

describe("security and robustness", () => {
  test("handles large header without crash", async () => {
    const res = await app.request("/api/v1/health", {
      headers: { "x-large": "a".repeat(8000) },
    });
    expect(res.status).toBe(200);
  });

  test("response time under 50ms", async () => {
    const start = performance.now();
    await app.request("/api/v1/health");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  test("concurrent 20 requests all succeed", async () => {
    const reqs = Array.from({ length: 20 }, () => app.request("/api/v1/health"));
    const results = await Promise.all(reqs);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  test("malformed path does not crash", async () => {
    const res = await app.request("/api/v1/health/%2e%2e");
    expect([200, 404, 400]).toContain(res.status);
  });

  test("sets explicit security headers on health", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
