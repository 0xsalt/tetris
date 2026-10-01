import { homedir } from "node:os";
import { PIECE_NAMES } from "./game-logic";
import { boardFacts, enumeratePlacements, parseBoard } from "./jev/placements";
import { Budget, CallLog, USD_PER_INPUT_TOKEN, decide, loadApiKey } from "./jev/jev";

// Loopback only. Tailnet access comes from `tailscale serve` in front of this port.
const HOSTNAME = "127.0.0.1";
const JEV_ENV_FILE = process.env.JEV_ENV_FILE || `${homedir()}/.config/tetris-demo/jev.env`;
const JEV_LOG_FILE = process.env.JEV_LOG_FILE || `${homedir()}/.local/state/tetris-demo/jev-calls.jsonl`;
// Daily spend ceiling in dollars, converted to billed input tokens at TypeSafe's list price.
const JEV_DAILY_USD_CAP = parseFloat(process.env.JEV_DAILY_USD_CAP || "1.50");
const JEV_DAILY_TOKEN_CAP = Math.floor(JEV_DAILY_USD_CAP / USD_PER_INPUT_TOKEN);
// Decide calls per rolling minute, across all viewers. The client paces itself at one a second.
const JEV_RATE_PER_MIN = parseInt(process.env.JEV_RATE_PER_MIN || "120");
// A board is 22 rows of 10 characters; nothing legitimate comes close to this.
const MAX_BODY_BYTES = 16 * 1024;
// Host names this server answers to. Refusing every other Host stops DNS rebinding: a page on an
// attacker's domain that re-resolves to 127.0.0.1 would otherwise be same-origin and could spend
// the budget. Tailscale names (*.ts.net) are allowed because only Tailscale controls that DNS.
// Add others, comma-separated, in JEV_ALLOWED_HOSTS.
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]",
  ...(process.env.JEV_ALLOWED_HOSTS || "").split(",").map(h => h.trim().toLowerCase()).filter(Boolean)]);

function hostAllowed(req: Request) {
  const host = (req.headers.get("host") || "").toLowerCase().replace(/:\d+$/, "");
  return ALLOWED_HOSTS.has(host) || host.endsWith(".ts.net");
}

const apiKey = loadApiKey(JEV_ENV_FILE);
const log = new CallLog(JEV_LOG_FILE);
const budget = new Budget(JEV_DAILY_TOKEN_CAP, JEV_LOG_FILE);

// The Jev client exists only when a key is present; the static page is untouched otherwise.
let clientBundle: string | null = null;
if (apiKey) {
  const built = await Bun.build({ entrypoints: [`${import.meta.dir}/jev/client.ts`], target: "browser" });
  if (!built.success) throw new AggregateError(built.logs, "jev client build failed");
  clientBundle = await built.outputs[0].text();
}

// The page's one inline script, allowed by hash so the CSP needs no 'unsafe-inline' for scripts.
const indexHtml = await Bun.file(`${import.meta.dir}/public/index.html`).text();
const scriptHashes = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${new Bun.CryptoHasher("sha256").update(m[1]).digest("base64")}'`);

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

function withSecurityHeaders(res: Response) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

const recentDecides: number[] = [];
function rateLimited() {
  const now = Date.now();
  while (recentDecides.length && now - recentDecides[0] > 60_000) recentDecides.shift();
  if (recentDecides.length >= JEV_RATE_PER_MIN) return true;
  recentDecides.push(now);
  return false;
}

function status() {
  return {
    enabled: apiKey !== null,
    calls_total: log.count,
    calls_today: budget.callsToday,
    tokens_today: budget.spent,
    daily_cap: budget.dailyCap,
    exhausted: budget.exhausted,
    cost_today_usd: budget.spent * USD_PER_INPUT_TOKEN,
    cost_total_usd: log.inputTokens * USD_PER_INPUT_TOKEN,
    cost_per_call_usd: budget.callsToday ? (budget.spent * USD_PER_INPUT_TOKEN) / budget.callsToday : 0,
    daily_cap_usd: JEV_DAILY_USD_CAP,
  };
}

async function handleDecide(req: Request) {
  if (!apiKey) return json({ error: "jev disabled: no key" }, 503);
  // Another site can make a visitor's browser POST here, but not with a JSON content type (that
  // needs a CORS preflight this server never answers), and browsers label it cross-site.
  if (req.headers.get("sec-fetch-site") === "cross-site") return json({ error: "cross-site request refused" }, 403);
  if (!req.headers.get("content-type")?.startsWith("application/json")) return json({ error: "content-type must be application/json" }, 415);
  if (budget.exhausted) return json({ error: "daily budget spent", ...status() }, 429);
  if (rateLimited()) return json({ error: "rate limited" }, 429);

  const body: any = await req.json().catch(() => null);
  const board = parseBoard(body?.board);
  const piece = body?.piece;
  const upcoming = Array.isArray(body?.upcoming) ? body.upcoming.filter((p: unknown) => PIECE_NAMES.includes(p as string)) : [];
  if (!board || !PIECE_NAMES.includes(piece)) return json({ error: "bad request: need board (22x10 of 0/1) and piece" }, 400);

  const placements = enumeratePlacements(board, piece);
  if (placements.length === 0) return json({ error: "no legal placement" }, 409);

  const result = await decide(apiKey, piece, upcoming, placements, boardFacts(board), log, budget);
  if (!result.ok) return json({ error: result.record.error, ...status() }, result.status);
  const chosen = placements.find(p => p.key === result.decision.choice)!;
  return json({ ...result.decision, rotation: chosen.rotation, x: chosen.x, record: result.record, ...status() });
}

async function route(req: Request): Promise<Response> {
  if (!hostAllowed(req)) return new Response("Misdirected Request", { status: 421 });
  const url = new URL(req.url);

  // No URL turns Jev on. Redirect old ?jev=... links to the plain address so none implies it can.
  // Collapse leading slashes: "//evil.example" as a Location is a protocol-relative off-site link.
  if (url.searchParams.has("jev")) {
    url.searchParams.delete("jev");
    return Response.redirect(url.pathname.replace(/^\/+/, "/") + url.search, 302);
  }

  if (url.pathname === "/api/jev/status") return json({ ...status(), recent: log.recent.slice(-20) });
  if (url.pathname === "/api/decide" && req.method === "POST") return handleDecide(req);
  if (url.pathname === "/jev/client.js" && clientBundle) {
    return new Response(clientBundle, { headers: { "Content-Type": "text/javascript" } });
  }

  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = Bun.file(`${import.meta.dir}/public${path}`);
  if (await file.exists()) {
    if (path === "/index.html" && clientBundle) {
      const html = (await file.text()).replace("</body>", `  <script type="module" src="/jev/client.js"></script>\n</body>`);
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response(file);
  }
  return new Response("Not Found", { status: 404 });
}

const server = Bun.serve({
  hostname: HOSTNAME,
  port: parseInt(process.env.PORT || "3000"),
  maxRequestBodySize: MAX_BODY_BYTES,
  // Never Bun's development error page (source and stack), whatever NODE_ENV says.
  development: false,
  error(err) {
    console.error(err);
    return withSecurityHeaders(new Response("Internal Server Error", { status: 500 }));
  },
  async fetch(req) {
    return withSecurityHeaders(await route(req));
  },
});

console.log(`Tetris server running on http://${HOSTNAME}:${server.port} (jev ${apiKey ? "enabled" : "disabled: no key at " + JEV_ENV_FILE})`);
