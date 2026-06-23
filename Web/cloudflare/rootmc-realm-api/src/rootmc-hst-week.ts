/** HST week boundaries — Monday 00:00 through Sunday 23:59:59 (Pacific/Honolulu). */

export const HST_OFFSET_MS = 10 * 60 * 60 * 1000;

function hstParts(at: Date): { y: number; m: number; d: number; dow: number } {
  const hstMs = at.getTime() - HST_OFFSET_MS;
  const hst = new Date(hstMs);
  return {
    y: hst.getUTCFullYear(),
    m: hst.getUTCMonth(),
    d: hst.getUTCDate(),
    dow: hst.getUTCDay(),
  };
}

function formatDayKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Monday date key for the completed HST week when the cron fires Sunday 08:00 HST.
 * Example: Sun 2026-06-22 08:00 HST → week_key 2026-06-16 (Mon Jun 16 – Sun Jun 22).
 */
export function previousCompletedHstWeekKey(at = new Date()): string {
  const { y, m, d, dow } = hstParts(at);
  const daysBackToMonday = dow === 0 ? 6 : dow + 6;
  const mon = new Date(Date.UTC(y, m, d - daysBackToMonday));
  return formatDayKey(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate());
}

export function hstWeekBoundsMs(weekKey: string): { startMs: number; endMs: number } {
  const startMs = Date.parse(`${weekKey}T00:00:00-10:00`);
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000 - 1;
  return { startMs, endMs };
}

export function previousHstWeekKey(beforeWeekKey: string): string {
  const startMs = Date.parse(`${beforeWeekKey}T00:00:00-10:00`);
  const prevMon = new Date(startMs - 7 * 24 * 60 * 60 * 1000);
  return formatDayKey(prevMon.getUTCFullYear(), prevMon.getUTCMonth(), prevMon.getUTCDate());
}

/** True on Sunday 18:xx UTC (= Sunday 08:xx HST) — matches ten-minute retry window. */
export function isWeeklyReportCronSlot(at = new Date()): boolean {
  return at.getUTCDay() === 0 && at.getUTCHours() === 18;
}
