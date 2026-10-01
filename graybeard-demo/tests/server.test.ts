// HTTP hardening of server.ts (ISSUE-00009). Runs the real server on a spare port with a dummy
// key. Every request here is refused before the upstream call, so nothing is ever billed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 30000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const RATE = 5;
let server: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "tetris-server-"));
  writeFileSync(join(dir, "jev.env"), "TYPESAFE_API_KEY=dummy-not-a-key\n", { mode: 0o600 });
  server = Bun.spawn(["bun", "run", `${import.meta.dir}/../src/server.ts`], {
    env: { ...process.env, PORT: String(PORT), JEV_ENV_FILE: join(dir, "jev.env"), JEV_LOG_FILE: join(dir, "calls.jsonl"), JEV_RATE_PER_MIN: String(RATE) },
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${BASE}/api/jev/status`); return; } catch { await Bun.sleep(50); }
  }
  throw new Error("server did not start");
});

afterAll(() => server.kill());

const decide = (body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
  fetch(`${BASE}/api/decide`, { method: "POST", headers, body });

describe("server hardening", () => {
  test("old ?jev links redirect on-site, never protocol-relative off-site", async () => {
    const res = await fetch(`${BASE}//evil.example.com/x?jev=1`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/evil.example.com/x");
  });

  test("decide refuses a non-JSON content type (cross-site simple POST)", async () => {
    expect((await decide("{}", { "Content-Type": "text/plain" })).status).toBe(415);
  });

  test("decide refuses a request the browser labels cross-site", async () => {
    expect((await decide("{}", { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
  });

  test("decide refuses an oversize body", async () => {
    expect((await decide("x".repeat(64 * 1024))).status).toBe(413);
  });

  test("pages carry CSP, nosniff, framing and referrer headers", async () => {
    const res = await fetch(`${BASE}/`);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src 'self' 'sha256-/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  // Last: it spends the rate window. Bad boards are counted but never reach TypeSafe.
  test("decide is rate limited", async () => {
    const codes: number[] = [];
    for (let i = 0; i < RATE + 2; i++) codes.push((await decide('{"board":[],"piece":"T"}')).status);
    expect(codes.slice(0, RATE).every(c => c === 400)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });
});
