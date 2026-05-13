import type { D1Database } from "@cloudflare/workers-types";
import { json } from "./cors";
import { verifyWorkerOpsAdmin } from "./push";

export type DiscordActivityStatsEnv = {
  DB: D1Database;
  RR_PUSH_ADMIN_SECRET?: string;
};

/** GET /api/internal/discord-activity-daily?days=14 — UTC days with message counts (`X-RR-Push-Admin-Key`). */
export async function handleDiscordActivityDailyGet(request: Request, env: DiscordActivityStatsEnv): Promise<Response> {
  const secret = (env.RR_PUSH_ADMIN_SECRET || "").trim();
  if (!secret) return json({ detail: "RR_PUSH_ADMIN_SECRET is not set on this Worker." }, 503);
  if (!(await verifyWorkerOpsAdmin(request, env))) {
    const has = Boolean(request.headers.get("X-RR-Push-Admin-Key"));
    return json({ detail: has ? "Invalid admin key." : "Missing X-RR-Push-Admin-Key header." }, 401);
  }

  let days = 14;
  const raw = new URL(request.url).searchParams.get("days");
  if (raw != null) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) days = Math.min(366, Math.max(1, n));
  }

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startStr = start.toISOString().slice(0, 10);

  const q = await env.DB.prepare(
    `SELECT day, message_count FROM discord_activity_daily WHERE day >= ? ORDER BY day ASC`,
  )
    .bind(startStr)
    .all<{ day: string; message_count: number }>();

  const byDay = new Map<string, number>();
  for (const row of q.results ?? []) {
    if (row?.day) byDay.set(String(row.day), Number(row.message_count) || 0);
  }

  const series: { day: string; message_count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push({ day: key, message_count: byDay.get(key) ?? 0 });
  }

  return json({ ok: true, days, series }, 200);
}

/**
 * POST /api/internal/discord-activity-daily-rebuild — recompute `discord_activity_daily` from
 * `developer_messages` rows keyed as `discord:<snowflake>:<scope>` (distinct snowflake / day).
 */
export async function handleDiscordActivityDailyRebuildPost(
  _request: Request,
  env: DiscordActivityStatsEnv,
): Promise<Response> {
  const secret = (env.RR_PUSH_ADMIN_SECRET || "").trim();
  if (!secret) return json({ detail: "RR_PUSH_ADMIN_SECRET is not set on this Worker." }, 503);
  if (!(await verifyWorkerOpsAdmin(request, env))) {
    const has = Boolean(request.headers.get("X-RR-Push-Admin-Key"));
    return json({ detail: has ? "Invalid admin key." : "Missing X-RR-Push-Admin-Key header." }, 401);
  }

  try {
    await env.DB.prepare(`DELETE FROM discord_activity_daily`).run();
    await env.DB
      .prepare(
        `INSERT INTO discord_activity_daily (day, message_count)
         WITH per AS (
           SELECT
             strftime('%Y-%m-%d', created_at) AS day,
             substr(id, 9, instr(substr(id, 9), ':') - 1) AS msg_id
           FROM developer_messages
           WHERE id LIKE 'discord:%' AND instr(substr(id, 9), ':') > 0
         )
         SELECT day, COUNT(DISTINCT msg_id) FROM per GROUP BY day`,
      )
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, detail: msg.slice(0, 400) }, 500);
  }

  const n = await env.DB.prepare(`SELECT COUNT(*) AS c FROM discord_activity_daily`).first<{ c: number }>();
  return json({ ok: true, day_rows: Number(n?.c ?? 0) }, 200);
}
