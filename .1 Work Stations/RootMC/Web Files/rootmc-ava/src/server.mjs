import http from "node:http";
import {
  loadEnv,
  AVA_PORT,
  cursorApiKey,
  AVA_MODEL,
  AVA_HANDOFF,
} from "./config.mjs";
import { workspaceRoot } from "./cursorBrain.mjs";
import { recommend } from "./recommend.mjs";
import {
  storePaths,
  loadHeartbeat,
  loadStatusEvents,
  isHushed,
} from "./store.mjs";
import { statusPageHtml } from "./statusPage.mjs";
import { solarPageHtml } from "./solarPage.mjs";
import { buildSolarDashboardPayload } from "./powerTelemetry.mjs";
import { loadHostSnapshot, itemizeHostMetricsTimeframes } from "./hostMetrics.mjs";
import { scheduleSelfRestart, loadRestartRequest } from "./selfUpgrade.mjs";
import { readLiveness, livenessDegraded } from "./liveness.mjs";

const env = await loadEnv();
storePaths();
const httpStartedAt = Date.now();

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${AVA_PORT}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/status")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(statusPageHtml());
    return;
  }

  if (req.method === "GET" && (url.pathname === "/solar" || url.pathname === "/power")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(solarPageHtml());
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "GET" && url.pathname === "/api/solar") {
    try {
      const hours = Number(url.searchParams.get("hours") || 8);
      const payload = await buildSolarDashboardPayload({
        hours,
        statusHttpUptimeMs: Date.now() - httpStartedAt,
      });
      res.end(JSON.stringify(payload));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, detail: err.message }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    const heartbeat = loadHeartbeat();
    const updatedAt = heartbeat?.updatedAt || 0;
    const liveness = readLiveness();
    const deg = livenessDegraded(heartbeat, liveness);
    res.end(
      JSON.stringify({
        ok: true,
        service: "ava-ivy",
        version: "0.5.1",
        httpUp: true,
        brain: "cursor",
        cursor: Boolean(cursorApiKey(env)),
        cursorModel: AVA_MODEL,
        workspace: workspaceRoot(),
        handoff: AVA_HANDOFF,
        hushed: isHushed(),
        degraded: deg.degraded,
        liveness,
        livenessCheck: deg,
        heartbeat,
        heartbeatAgeMs: updatedAt ? Date.now() - updatedAt : null,
        events: loadStatusEvents(24),
        jobs: (await import("./jobQueue.mjs")).listJobs(5),
        conversations: (await import("./conversationStore.mjs")).conversationStats(),
        hostMetrics: loadHostSnapshot(),
        hostMetricsTimeframes: itemizeHostMetricsTimeframes(),
        tokenEconomy: (await import("./tokenEconomy.mjs")).loadTokenEconomy(),
        tokenBoard: (await import("./tokenEconomy.mjs")).tokenBoardText(),
        reserves: (await import("./tokenEconomy.mjs")).reserveSnapshot(),
      }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/rewrite") {
    const body = await readJsonBody(req);
    if (!body || typeof body !== "object") {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, detail: "invalid_json" }));
      return;
    }
    const draft = String(body.text || body.content || "").trim();
    const context = Array.isArray(body.context) ? body.context.slice(-42) : [];
    const surface = String(body.surface || "discord");
    if (!draft) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, detail: "empty_text" }));
      return;
    }
    const contextBlock = context
      .map((m) => {
        if (typeof m === "string") return m;
        const who = m.who || m.author || "?";
        const text = m.text || m.content || "";
        return `${who}: ${text}`;
      })
      .join("\n")
      .slice(0, 6000);
    const question = [
      "Rewrite the following draft in Ava Ivy voice before send.",
      "Keep meaning; improve clarity; Gold not dollars; no secrets.",
      "Return ONLY the rewritten message text.",
      contextBlock ? `\nRecent context (last msgs):\n${contextBlock}` : "",
      `\nDraft:\n${draft}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const rewritten = await recommend({
        question,
        env,
        surface,
        authorId: String(body.authorId || "desktop"),
        authorName: String(body.authorName || "desktop"),
      });
      res.end(
        JSON.stringify({
          ok: true,
          text: String(rewritten || draft).trim() || draft,
          contextUsed: context.length,
        }),
      );
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, detail: err.message, text: draft }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    const heartbeat = loadHeartbeat();
    const liveness = readLiveness();
    const deg = livenessDegraded(heartbeat, liveness);
    res.end(
      JSON.stringify({
        ok: true,
        service: "ava-ivy",
        version: "0.5.1",
        brain: "cursor",
        cursor: Boolean(cursorApiKey(env)),
        cursorModel: AVA_MODEL,
        workspace: workspaceRoot(),
        handoff: AVA_HANDOFF,
        pollerLive: Boolean(heartbeat?.live),
        heartbeatAgeMs: heartbeat?.updatedAt ? Date.now() - heartbeat.updatedAt : null,
        restartPending: Boolean(loadRestartRequest()),
        degraded: deg.degraded,
        onBreak: Boolean(heartbeat?.onBreak),
        asleep: Boolean(heartbeat?.asleep),
        sleepWakeAt: heartbeat?.sleepWakeAtIso || null,
        gateway: heartbeat?.gatewayStats || null,
        childRestarts: liveness?.childRestartsTotal ?? 0,
        children: liveness?.children || null,
        note: "Open / for the status window. Grok unplugged. Watchdog respawns children.",
      }),
    );
    return;
  }

  // Localhost-only silent self-restart (manual code push / upgrade).
  if (
    req.method === "POST" &&
    (url.pathname === "/api/restart" || url.pathname === "/api/upgrade")
  ) {
    const parsed = await readJsonBody(req);
    if (parsed === null) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "invalid_json" }));
      return;
    }
    const result = scheduleSelfRestart({
      reason: parsed.reason || (url.pathname.includes("upgrade") ? "silent upgrade" : "manual restart"),
      delayMs: Number(parsed.delayMs) > 0 ? Number(parsed.delayMs) : 1500,
      requestedBy: parsed.requestedBy || "http",
      silent: parsed.silent !== false,
    });
    res.statusCode = result.ok ? 202 : 409;
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/recommend") {
    const parsed = await readJsonBody(req);
    if (parsed === null) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "invalid_json" }));
      return;
    }
    const answer = await recommend({
      question: parsed.question || parsed.prompt || "",
      context: parsed.context || "",
      env,
      authorId: parsed.authorId || parsed.discordId || "",
      authorName: parsed.authorName || parsed.username || "",
    });
    res.end(JSON.stringify({ answer }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(AVA_PORT, "127.0.0.1", () => {
  console.log(`ava-ivy status window http://127.0.0.1:${AVA_PORT}/`);
});
