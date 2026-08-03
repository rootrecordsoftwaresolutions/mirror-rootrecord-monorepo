/**
 * Cloud-dark mode — dream brain (Grok) unavailable / unpaid.
 * Discord + Telegram stay silent for auto-replies until cleared.
 * Slack / Root Server digs can still run when Cursor is up.
 */
import fs from "node:fs";
import path from "node:path";
import { storePaths, pushStatusEvent } from "./store.mjs";

function cloudDarkPath() {
  return path.join(storePaths().dir, "cloud-dark.json");
}

function readCloudDark() {
  try {
    if (!fs.existsSync(cloudDarkPath())) return null;
    return JSON.parse(fs.readFileSync(cloudDarkPath(), "utf8"));
  } catch {
    return null;
  }
}

function writeCloudDark(value) {
  fs.mkdirSync(path.dirname(cloudDarkPath()), { recursive: true });
  fs.writeFileSync(cloudDarkPath(), JSON.stringify(value, null, 2), "utf8");
}

/** True when dream/cloud replies are paused (Grok unpaid / unreachable). */
export function isCloudDark() {
  const v = String(process.env.AVA_CLOUD_DARK || "").trim();
  if (v === "1" || /^true$/i.test(v)) return true;
  if (v === "0" || /^false$/i.test(v)) return false;
  const s = readCloudDark();
  return Boolean(s?.dark);
}

export function setCloudDark({
  dark = true,
  reason = "cloud unreachable",
  by = "system",
} = {}) {
  const payload = {
    dark: Boolean(dark),
    reason: String(reason).slice(0, 300),
    by: String(by).slice(0, 80),
    updatedAt: Date.now(),
  };
  writeCloudDark(payload);
  pushStatusEvent(
    dark ? `cloud dark · ${payload.reason}` : `cloud restored · ${payload.reason}`,
  );
  return payload;
}

export function clearCloudDark(reason = "cleared") {
  return setCloudDark({ dark: false, reason, by: "clear" });
}

export function loadCloudDarkState() {
  return readCloudDark();
}

/** Public one-liner when something still asks during cloud-dark (usually unused). */
export function cloudDarkSilentNote() {
  return null;
}
