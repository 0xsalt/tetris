// HTTP hardening of server.ts (ISSUE-00009). Runs the real server on a spare port with a dummy
// key. Every request here is refused before the upstream call, so nothing is ever billed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RATE = 5;
const LOGIN = "player@example.com";
let dir = "";
let BASE = "";
let LOCKED = ""; // a second server that lets only LOGIN spend
const servers: ReturnType<typeof Bun.spawn>[] = [];

async function start(env: Record<string, string>) {
  const port = 30000 + Math.floor(Math.random() * 20000);
  servers.push(Bun.spawn(["bun", "run", `${import.meta.dir}/../src/server.ts`], {
    env: { ...process.env, PORT: String(port), JEV_ENV_FILE: join(dir, "jev.env"), JEV_RATE_PER_MIN: String(RATE), ...env },
    stdout: "ignore",
    stderr: "ignore",
  }));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/api/jev/status`); return base; } catch { await Bun.sleep(50); }
  }
  throw new Error("server did not start");
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "tetris-server-"));
  writeFileSync(join(dir, "jev.env"), "TYPESAFE_API_KEY=dummy-not-a-key\n", { mode: 0o600 });
  BASE = await start({ JEV_LOG_FILE: join(dir, "calls.jsonl"), JEV_GAMES_FILE: join(dir, "games.jsonl") });
  LOCKED = await start({
    JEV_LOG_FILE: join(dir, "locked.jsonl"), JEV_GAMES_FILE: join(dir, "locked-games.jsonl"),
    JEV_ALLOWED_LOGINS: ` ${LOGIN.toUpperCase()} ,other@example.com`,
  });
});

afterAll(() => { for (const s of servers) s.kill(); });

const decide = (body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
  fetch(`${BASE}/api/decide`, { method: "POST", headers, body });

describe("server hardening", () => {
  test("old ?jev links redirect on-site, never protocol-relative off-site", async () => {
    for (const path of ["//evil.example.com/x", "/.//evil.example.com/x", "/a/..//evil.example.com/x", "/\\evil.example.com/x"]) {
      const res = await fetch(`${BASE}${path}?jev=1`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/evil.example.com/x");
    }
  });

  test("refuses a Host it does not serve (DNS rebinding)", async () => {
    expect((await fetch(`${BASE}/api/jev/status`, { headers: { Host: "evil.example" } })).status).toBe(421);
    expect((await decide("{}", { "Content-Type": "application/json", Host: `evil.example:${new URL(BASE).port}` })).status).toBe(421);
  });

  test("answers to loopback and Tailscale host names", async () => {
    const port = new URL(BASE).port;
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, "box.tail1234.ts.net:5059"]) {
      expect((await fetch(`${BASE}/api/jev/status`, { headers: { Host: host } })).status).toBe(200);
    }
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
    // The hash must be of the page's actual inline script, or the browser blocks the game.
    const html = await Bun.file(`${import.meta.dir}/../src/public/index.html`).text();
    const inline = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const hash = new Bun.CryptoHasher("sha256").update(inline).digest("base64");
    expect(csp).toContain(`script-src 'self' 'sha256-${hash}'`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  test("with no login list, only loopback may spend", async () => {
    const res = await decide('{"board":[],"piece":"T"}', { "Content-Type": "application/json", Host: "box.tail1234.ts.net" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("jev locked: set JEV_ALLOWED_LOGINS");
  });

  test("with a login list, only those tailnet logins may spend or log", async () => {
    const post = (path: string, headers: Record<string, string>) =>
      fetch(`${LOCKED}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: '{"board":[],"piece":"T"}' });
    for (const path of ["/api/decide", "/api/jev/game"]) {
      expect((await post(path, {})).status).toBe(403);
      expect((await post(path, { "Tailscale-User-Login": "stranger@example.com" })).status).toBe(403);
    }
    // Past the login check, the bad board is the next refusal.
    expect((await post("/api/decide", { "Tailscale-User-Login": LOGIN })).status).toBe(400);
  });

  test("game end is logged with its seed, score and piece count", async () => {
    const end = (body: unknown) =>
      fetch(`${BASE}/api/jev/game`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await end({ game: 42, score: 1200, lines: 8, level: 1, pieces: 31 })).status).toBe(204);
    for (const bad of [{ game: 42 }, { game: 42, score: -1, lines: 8, level: 1, pieces: 31 }, { game: "x", score: 1, lines: 1, level: 1, pieces: 1 }]) {
      expect((await end(bad)).status).toBe(400);
    }
    const rows = readFileSync(join(dir, "games.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ game: 42, score: 1200, lines: 8, level: 1, pieces: 31 });
  });

  // Last: it spends the rate window. Bad boards are counted but never reach TypeSafe.
  test("decide is rate limited", async () => {
    const results: { status: number; error: string }[] = [];
    for (let i = 0; i < RATE + 2; i++) {
      const res = await decide('{"board":[],"piece":"T"}');
      results.push({ status: res.status, error: (await res.json()).error });
    }
    expect(results.slice(0, RATE).every(r => r.status === 400)).toBe(true);
    expect(results.at(-1)).toEqual({ status: 429, error: "rate limited" });
  });
});
