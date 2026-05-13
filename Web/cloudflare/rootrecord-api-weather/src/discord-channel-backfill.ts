import { json } from "./cors";
import { verifyWorkerOpsAdmin } from "./push";
import { runDiscordAnnouncementsHistoryBackfill, type DiscordDeveloperSyncEnv } from "./discord-developer-sync";

export type DiscordChannelBackfillEnv = DiscordDeveloperSyncEnv & { RR_PUSH_ADMIN_SECRET?: string };

/** POST /api/internal/discord-channel-backfill — paginated scan of announcements history (`X-RR-Push-Admin-Key`). */
export async function handleDiscordChannelBackfillPost(request: Request, env: DiscordChannelBackfillEnv): Promise<Response> {
  if (!(await verifyWorkerOpsAdmin(request, env))) {
    const has = Boolean(request.headers.get("X-RR-Push-Admin-Key"));
    return json({ detail: has ? "Invalid admin key." : "Missing X-RR-Push-Admin-Key header." }, 401);
  }
  const secret = (env.RR_PUSH_ADMIN_SECRET || "").trim();
  if (!secret) return json({ detail: "RR_PUSH_ADMIN_SECRET is not set on this Worker." }, 503);

  let body: { before?: string | null; max_pages?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const before = body.before != null ? String(body.before).trim() || null : null;
  const max_pages =
    typeof body.max_pages === "number" && Number.isFinite(body.max_pages) ? body.max_pages : undefined;

  const result = await runDiscordAnnouncementsHistoryBackfill(env, { before, max_pages });
  return json(
    {
      ok: result.ok,
      skipped: result.skipped,
      inserted: result.inserted,
      activity_upserts: result.activity_upserts,
      pages_fetched: result.pages_fetched,
      messages_scanned: result.messages_scanned,
      done: result.done,
      next_before: result.next_before,
      hint: result.done
        ? "Channel fully scanned for this run (or no history)."
        : "POST again with JSON body { \"before\": <next_before> } to continue older messages.",
    },
    result.ok ? 200 : 502,
  );
}
