/**
 * Sunday 08:00 HST — weekly activity awards + intelligence suite.
 */
import { runRootMcWeeklyActivityAwards } from "./rootmc-weekly-activity-awards";
import type { Env } from "./realm-router";
import {
  gatherWeeklyMetrics,
  previousCompletedHstWeekKey,
  runRootMcCombinedWeeklyReport,
  runRootMcWeeklyCategoryReports,
  weeklyCombinedReportPosted,
} from "./rootmc-weekly-reports";
import { resolveServerId } from "./rootmc-daily-report";

function str(v: unknown): string {
  return String(v ?? "").trim();
}

export async function runFullWeeklyReportSuite(
  env: Env,
): Promise<{
  weekKey: string;
  active: Awaited<ReturnType<typeof runRootMcWeeklyActivityAwards>>;
  weekly: Awaited<ReturnType<typeof runRootMcCombinedWeeklyReport>>;
  categories: Awaited<ReturnType<typeof runRootMcWeeklyCategoryReports>>;
}> {
  const weekKey = previousCompletedHstWeekKey();
  const serverId = await resolveServerId(env.DB);
  const metrics = await gatherWeeklyMetrics(env, weekKey, serverId);

  const active = await runRootMcWeeklyActivityAwards(env, weekKey);

  const weekly = (await weeklyCombinedReportPosted(env.DB, serverId, weekKey))
    ? { ok: true, weekKey, detail: "already posted" }
    : await runRootMcCombinedWeeklyReport(env, { weekKey, serverId, metrics });

  const categories = await runRootMcWeeklyCategoryReports(env, { weekKey, serverId, metrics });

  console.log(
    JSON.stringify({
      msg: "rootmc_weekly_suite_complete",
      weekKey,
      active: active.detail,
      weekly: weekly.detail,
      categories: categories.map((c) => `${c.category}:${c.detail}`),
    }),
  );

  return { weekKey, active, weekly, categories };
}

export async function runRootMcWeeklyReportCron(env: Env): Promise<void> {
  await runFullWeeklyReportSuite(env);
}
