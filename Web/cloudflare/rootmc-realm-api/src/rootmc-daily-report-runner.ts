/**
 * Orchestrate daily + category reports without exceeding a single Worker CPU budget.
 */

import {
  ROOTMC_DEDICATED_CHANNEL_CATEGORIES,
  type RootMcDedicatedChannelCategory,
} from "./rootmc-grok-prompts";
import { runRootMcDailyCategoryReports } from "./rootmc-daily-category-reports";
import {
  gatherDailyMetrics,
  previousHstDayKey,
  resolveServerId,
  type DailyMetrics,
  type RootMcDailyReportEnv,
} from "./rootmc-daily-report";

const ROOTMC_API_BASE = "https://api.rootmc.net";

function str(v: unknown): string {
  return String(v ?? "").trim();
}

export type CategoryReportResult = {
  category: RootMcDedicatedChannelCategory;
  ok: boolean;
  detail?: string;
};

/** Run each category brief in its own Worker invocation (Grok + Discord). */
export async function runCategoryReportsIsolated(
  env: RootMcDailyReportEnv,
  serverId: string,
  metrics: DailyMetrics,
): Promise<CategoryReportResult[]> {
  const jwt = str(env.JWT_SECRET);
  if (!jwt || jwt.length < 16) {
    const fallback = await runRootMcDailyCategoryReports(env, { serverId, metrics });
    return fallback.map((r) => ({ category: r.category, ok: r.ok, detail: r.detail }));
  }

  const results: CategoryReportResult[] = [];
  for (const category of ROOTMC_DEDICATED_CHANNEL_CATEGORIES) {
    try {
      const res = await fetch(
        `${ROOTMC_API_BASE}/api/rootmc/daily-report/internal-category/${encodeURIComponent(category)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwt}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ serverId, metrics }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string };
      results.push({
        category,
        ok: Boolean(data.ok ?? res.ok),
        detail: str(data.detail) || (res.ok ? "posted" : `http ${res.status}`),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ category, ok: false, detail: msg.slice(0, 120) });
    }
  }
  return results;
}

export async function runFullDailyReportSuite(
  env: RootMcDailyReportEnv,
  opts?: { serverId?: string; previewLabel?: string; clearDayKey?: string },
): Promise<{ dayKey: string; daily: { ok: boolean; detail?: string }; categories: CategoryReportResult[] }> {
  const { runRootMcCombinedDailyReport } = await import("./rootmc-daily-combined");
  const serverId = str(opts?.serverId) || (await resolveServerId(env.DB));
  const dayKey = opts?.clearDayKey || previousHstDayKey();

  if (opts?.clearDayKey) {
    await env.DB.prepare(`DELETE FROM rootmc_daily_category_reports WHERE server_id = ? AND day_key = ?`)
      .bind(serverId, dayKey)
      .run();
    await env.DB.prepare(`DELETE FROM rootmc_daily_reports WHERE server_id = ? AND day_key = ?`)
      .bind(serverId, dayKey)
      .run();
  }

  const metrics = await gatherDailyMetrics(env, dayKey, serverId);
  const daily = await runRootMcCombinedDailyReport(env, {
    previewLabel: opts?.previewLabel,
    serverId,
    metrics,
  });
  const categories = await runCategoryReportsIsolated(env, serverId, metrics);
  return {
    dayKey,
    daily: { ok: daily.ok, detail: daily.detail },
    categories,
  };
}

export function formatReportSuiteSummary(
  dayKey: string,
  daily: { ok: boolean; detail?: string },
  categories: CategoryReportResult[],
): string {
  const lines = [`**Daily summary** — ${daily.ok ? daily.detail || "posted" : daily.detail || "failed"}`];
  for (const row of categories) {
    lines.push(`**${row.category}** — ${row.ok ? row.detail || "posted" : row.detail || "failed"}`);
  }
  return `**Reports complete** (${dayKey} HST)\n${lines.join("\n")}`;
}
