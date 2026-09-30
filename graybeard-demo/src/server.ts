import { homedir } from "node:os";
import { PIECE_NAMES } from "./game-logic";
import { enumeratePlacements, parseBoard } from "./jev/placements";
import { Budget, CallLog, decide, loadApiKey } from "./jev/jev";

// Loopback only. Tailnet access comes from `tailscale serve` in front of this port.
const HOSTNAME = "127.0.0.1";
const JEV_ENV_FILE = process.env.JEV_ENV_FILE || `${homedir()}/.config/tetris-demo/jev.env`;
const JEV_LOG_FILE = process.env.JEV_LOG_FILE || `${homedir()}/.local/state/tetris-demo/jev-calls.jsonl`;
const JEV_DAILY_TOKEN_CAP = parseInt(process.env.JEV_DAILY_TOKEN_CAP || "5000000");

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

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function status() {
  return {
    enabled: apiKey !== null,
    calls_total: log.count,
    tokens_today: budget.spent,
    daily_cap: budget.dailyCap,
    exhausted: budget.exhausted,
  };
}

async function handleDecide(req: Request) {
  if (!apiKey) return json({ error: "jev disabled: no key" }, 503);
  if (budget.exhausted) return json({ error: "daily budget spent", ...status() }, 429);

  const body: any = await req.json().catch(() => null);
  const board = parseBoard(body?.board);
  const piece = body?.piece;
  const upcoming = Array.isArray(body?.upcoming) ? body.upcoming.filter((p: unknown) => PIECE_NAMES.includes(p as string)) : [];
  if (!board || !PIECE_NAMES.includes(piece)) return json({ error: "bad request: need board (22x10 of 0/1) and piece" }, 400);

  const placements = enumeratePlacements(board, piece);
  if (placements.length === 0) return json({ error: "no legal placement" }, 409);

  const result = await decide(apiKey, piece, upcoming, placements, log, budget);
  if (!result.ok) return json({ error: result.record.error, ...status() }, result.status);
  const chosen = placements.find(p => p.key === result.decision.choice)!;
  return json({ ...result.decision, rotation: chosen.rotation, x: chosen.x, record: result.record, ...status() });
}

const server = Bun.serve({
  hostname: HOSTNAME,
  port: parseInt(process.env.PORT || "3000"),
  async fetch(req) {
    const url = new URL(req.url);

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
  },
});

console.log(`Tetris server running on http://${HOSTNAME}:${server.port} (jev ${apiKey ? "enabled" : "disabled: no key at " + JEV_ENV_FILE})`);
