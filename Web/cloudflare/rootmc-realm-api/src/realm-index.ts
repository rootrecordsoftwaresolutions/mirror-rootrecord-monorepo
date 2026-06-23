import type { ExecutionContext } from "@cloudflare/workers-types";

import { json } from "./cors";
import type { Env } from "./realm-router";
import { handleRequest } from "./realm-router";
import { handleTownyDiscordReconcileCron } from "./discord-rootmc-towny";
import { previousHstDayKey, resolveServerId, runRootMcDailyReportCron } from "./rootmc-daily-report";
import { combinedReportPosted } from "./rootmc-ai-report-store";
import { expireDueProposals } from "./rootmc-community-proposals";
import { evaluateShopPriceAlerts } from "./rootmc-shop-alerts";
import { runRootMcDiscordActivitySync } from "./rootmc-discord-activity-sync";
import { isWeeklyReportCronSlot } from "./rootmc-hst-week";
import { runRootMcWeeklyReportCron } from "./rootmc-weekly-report-runner";

async function maybeRunDailyReports(env: Env, when: Date): Promise<void> {
  const dayKey = previousHstDayKey(when);
  const serverId = await resolveServerId(env.DB);
  if (await combinedReportPosted(env.DB, serverId, dayKey)) {
    return;
  }
  await runRootMcDailyReportCron(env);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("http_request_uncaught", detail.slice(0, 800));
      return json({ detail: "Internal Server Error" }, 500);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const when = new Date(event.scheduledTime || Date.now());
    ctx.waitUntil(handleTownyDiscordReconcileCron(env));
    ctx.waitUntil(expireDueProposals(env).catch((e) => console.warn("rootmc_proposals_expire", e)));
    ctx.waitUntil(
      evaluateShopPriceAlerts(env).catch((e) =>
        console.warn("rootmc_shop_alerts_cron", e instanceof Error ? e.message : String(e)),
      ),
    );
    ctx.waitUntil(
      runRootMcDiscordActivitySync(env).catch((e) =>
        console.warn("rootmc_discord_activity_sync", e instanceof Error ? e.message : String(e)),
      ),
    );
    // Midnight HST = 10:xx UTC — retry on any */10 tick until today's report is posted.
    if (when.getUTCHours() === 10) {
      ctx.waitUntil(
        maybeRunDailyReports(env, when).catch((e) =>
          console.error("rootmc_daily_reports_failed", e instanceof Error ? e.message : String(e)),
        ),
      );
    }
    // Sunday 08:00 HST = 18:00 UTC — weekly activity awards + intelligence suite.
    if (isWeeklyReportCronSlot(when)) {
      ctx.waitUntil(
        runRootMcWeeklyReportCron(env).catch((e) =>
          console.error("rootmc_weekly_reports_failed", e instanceof Error ? e.message : String(e)),
        ),
      );
    }
  },
};
