import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { storePaths } from "./store.mjs";

/**
 * EcoFlow Open API (official HMAC sign) — https://developer.ecoflow.com/
 * REST quota + MQTT certification. Local data buckets created while Ava runs.
 * Serials: AVA_ECOFLOW_SN (comma-separated) — supplied later by operator.
 */

const DEFAULT_BASE = "https://api-a.ecoflow.com";

function ecoPath() {
  return path.join(storePaths().dir, "ecoflow.json");
}

/** Local telemetry buckets under Ava handoff data/ecoflow/ */
export function ecoBucketsRoot() {
  return path.join(storePaths().dir, "ecoflow");
}

export function ensureEcoBuckets() {
  const root = ecoBucketsRoot();
  const dirs = [
    root,
    path.join(root, "devices"),
    path.join(root, "quota"),
    path.join(root, "history"),
    path.join(root, "mqtt"),
    path.join(root, "certs"),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }
  const readme = path.join(root, "README.txt");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      [
        "Ava EcoFlow buckets (created at runtime)",
        "devices/  — device list snapshots",
        "quota/    — per-SN quota JSON",
        "history/  — rolling SOC / power samples",
        "mqtt/     — last MQTT certification payload (no secret in git)",
        "certs/    — reserved",
        "",
        "Keys live in RootMC .env (AVA_ECOFLOW_*). Serials: AVA_ECOFLOW_SN.",
        "Docs: https://developer.ecoflow.com/",
      ].join("\n"),
      "utf8",
    );
  }
  return root;
}

function accessKey() {
  return String(
    process.env.AVA_ECOFLOW_ACCESS_KEY || process.env.ECOFLOW_ACCESS_KEY || "",
  ).trim();
}

function secretKey() {
  return String(
    process.env.AVA_ECOFLOW_SECRET_KEY || process.env.ECOFLOW_SECRET_KEY || "",
  ).trim();
}

function baseUrl() {
  return String(
    process.env.AVA_ECOFLOW_BASE_URL || process.env.ECOFLOW_BASE_URL || DEFAULT_BASE,
  )
    .trim()
    .replace(/\/$/, "");
}

/** Comma/space separated serials. Empty until operator provides them. */
export function configuredSerials() {
  return String(process.env.AVA_ECOFLOW_SN || process.env.ECOFLOW_SN || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ecoConfigured() {
  return Boolean(accessKey() && secretKey());
}

function qstring(params) {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

function hmacSha256Hex(data, key) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}

/** Official Open API signed GET. */
export async function ecoflowGet(apiPath, params = {}) {
  const key = accessKey();
  const secret = secretKey();
  if (!key || !secret) throw new Error("EcoFlow keys missing");

  const nonce = String(Math.floor(100000 + Math.random() * 900000));
  const timestamp = String(Date.now());
  const signHeaders = { accessKey: key, nonce, timestamp };
  const flatParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v != null && v !== ""),
  );
  const paramQs = qstring(flatParams);
  const headerQs = qstring(signHeaders);
  const signStr = (paramQs ? `${paramQs}&` : "") + headerQs;
  const sign = hmacSha256Hex(signStr, secret);

  // Manual query string (same bytes as sign). Do NOT set Content-Type on GET —
  // EcoFlow returns code 8521 "signature is wrong" when application/json is sent.
  const fullUrl = paramQs ? `${baseUrl()}${apiPath}?${paramQs}` : `${baseUrl()}${apiPath}`;
  const res = await fetch(fullUrl, {
    method: "GET",
    headers: {
      accessKey: key,
      nonce,
      timestamp,
      sign,
      Accept: "application/json",
      "User-Agent": "AvaIvyRootMC/0.5 (EcoFlow OpenAPI)",
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  // Treat EcoFlow business codes: HTTP 200 + code "0" = ok
  const code = json?.code != null ? String(json.code) : null;
  const bizOk = code == null || code === "0";
  return {
    ok: res.ok && bizOk,
    status: res.status,
    json,
    text: text.slice(0, 500),
  };
}

export function loadEcoSnapshot() {
  try {
    if (!fs.existsSync(ecoPath())) return null;
    return JSON.parse(fs.readFileSync(ecoPath(), "utf8"));
  } catch {
    return null;
  }
}

export function saveEcoSnapshot(partial) {
  const prev = loadEcoSnapshot() || {};
  const next = { ...prev, ...partial, updatedAt: Date.now() };
  fs.mkdirSync(path.dirname(ecoPath()), { recursive: true });
  fs.writeFileSync(ecoPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function pickSoc(data) {
  if (!data || typeof data !== "object") return null;
  const candidates = [
    data.soc,
    data.bmsBattSoc,
    data.batteryPercentage,
    data.cmsBattSoc,
    data?.bmsMaster?.soc,
    data?.bmsHeartBeatPack?.[0],
    data["bms_bmsStatus.soc"],
    data["bmsMaster.soc"],
    data["pd.soc"],
  ];
  for (const c of candidates) {
    if (c != null && !Number.isNaN(Number(c))) return Number(c);
  }
  for (const [k, v] of Object.entries(data)) {
    if (/soc|battery.*pct|batt.*soc/i.test(k) && typeof v === "number") return v;
  }
  return null;
}

/** EcoFlow often reports mW; normalize to watts for Ava briefs. */
function toWatts(raw, keyHint = "") {
  if (raw == null || Number.isNaN(Number(raw))) return null;
  const n = Number(raw);
  const key = String(keyHint || "");
  if (/mw|milliwatt/i.test(key) || Math.abs(n) >= 10000) return Math.round(n / 1000);
  return Math.round(n);
}

function pickPowerWatts(data) {
  if (!data || typeof data !== "object") return { inW: null, outW: null, solarW: null };
  const get = (...keys) => {
    for (const k of keys) {
      if (data[k] != null && !Number.isNaN(Number(data[k]))) {
        return { key: k, val: Number(data[k]) };
      }
    }
    return null;
  };
  const inp = get(
    "pd.wattsInSum",
    "inv.inputWatts",
    "mppt.inWatts",
    "pd.wattsInSum_mw",
  );
  const out = get(
    "pd.wattsOutSum",
    "inv.outputWatts",
    "pd.wattsOutSum_mw",
  );
  const solar = get(
    "mppt.inWatts",
    "mppt.pv1InWatts",
    "mppt.pv2InWatts",
  );
  return {
    inW: inp ? toWatts(inp.val, inp.key) : null,
    outW: out ? toWatts(out.val, out.key) : null,
    solarW: solar ? toWatts(solar.val, solar.key) : null,
  };
}

function minuteBucketPath(sn) {
  return path.join(ecoBucketsRoot(), "history", `${sn || "unknown"}-minutes.jsonl`);
}

function appendMinuteTotals(sn, sample) {
  const file = minuteBucketPath(sn);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const minute = Math.floor(Date.now() / 60000) * 60000;
  fs.appendFileSync(
    file,
    `${JSON.stringify({ minute, at: Date.now(), ...sample })}\n`,
    "utf8",
  );
}

function readMinuteRows(sn) {
  try {
    const file = minuteBucketPath(sn);
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, "utf8")
      .trim()
      .split(/\n+/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Average solar intake from local minute buckets for "this morning" (local TZ).
 * Honest about sample window — never invent dawn if buckets start later.
 * @param {{ tzOffsetHours?: number, morningStartHour?: number, morningEndHour?: number }} [opts]
 */
export function summarizeMorningSolar(opts = {}) {
  const tz = Number(opts.tzOffsetHours ?? -10); // Hawaii default
  const startHour = Number(opts.morningStartHour ?? 6);
  const endHour = Number(opts.morningEndHour ?? 12);
  const now = Date.now();
  // Local calendar day at tz offset
  const localNow = new Date(now + tz * 3600_000);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();
  // Convert local wall times back to UTC ms
  const morningStart =
    Date.UTC(y, m, d, startHour, 0, 0) - tz * 3600_000;
  const morningEnd = Date.UTC(y, m, d, endHour, 0, 0) - tz * 3600_000;
  const end = Math.min(now, morningEnd);

  const snap = loadEcoSnapshot();
  const fromSnap = Object.keys(snap?.perSn || {});
  const sns = fromSnap.length
    ? fromSnap
    : configuredSerials().length
      ? configuredSerials()
      : Object.values(ECO_NICKNAMES).filter((v, i, a) => a.indexOf(v) === i);

  const perSn = {};
  const minuteMap = new Map();
  let earliest = null;
  let latest = null;

  for (const sn of sns) {
    const rows = readMinuteRows(sn).filter((r) => {
      const t = Number(r.minute || r.at || 0);
      return t >= morningStart && t <= end;
    });
    const vals = rows
      .map((r) => Number(r.solarW))
      .filter((n) => Number.isFinite(n));
    for (const r of rows) {
      const t = Number(r.minute || Math.floor(Number(r.at || 0) / 60000) * 60000);
      if (!Number.isFinite(t)) continue;
      if (earliest == null || t < earliest) earliest = t;
      if (latest == null || t > latest) latest = t;
      const cur = minuteMap.get(t) || { solar: 0 };
      if (Number.isFinite(Number(r.solarW))) cur.solar += Number(r.solarW);
      minuteMap.set(t, cur);
    }
    perSn[sn] = {
      samples: vals.length,
      avgW: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      minW: vals.length ? Math.min(...vals) : null,
      maxW: vals.length ? Math.max(...vals) : null,
    };
  }

  const siteVals = [...minuteMap.values()].map((v) => v.solar);
  return {
    tzOffsetHours: tz,
    morningStart,
    morningEnd: end,
    sampleStart: earliest,
    sampleEnd: latest,
    siteMinutes: siteVals.length,
    siteAvgW: siteVals.length
      ? siteVals.reduce((a, b) => a + b, 0) / siteVals.length
      : null,
    siteMaxW: siteVals.length ? Math.max(...siteVals) : null,
    perSn,
    sns,
    note:
      earliest != null && earliest > morningStart + 30 * 60_000
        ? "sample window starts after dawn - not a full morning average"
        : siteVals.length
          ? "ok"
          : "no morning samples yet",
  };
}

/** Friendly nicknames (cucumbers / shackas) → SN for ops talk. */
export const ECO_NICKNAMES = {
  cucumbers: "R331ZAB5SG6S2858", // Delta 2 primary
  shackas: "R621ZA16XH6K1155", // River 2 Pro
  "delta-2-a": "R331ZAB5SG6S2858",
  "delta-2-b": "R331ZAB5SG755642",
  "river-2-pro": "R621ZA16XH6K1155",
};

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}

function appendHistory(sn, sample) {
  const file = path.join(ecoBucketsRoot(), "history", `${sn || "unknown"}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ at: Date.now(), ...sample })}\n`, "utf8");
}

/**
 * Ensure buckets exist, refresh MQTT cert (account-level), device list, and per-SN quota.
 */
export async function refreshEcoFlow() {
  ensureEcoBuckets();

  if (!ecoConfigured()) {
    return saveEcoSnapshot({
      status: "unconfigured",
      batteryPct: null,
      buckets: ecoBucketsRoot(),
      note: "Set AVA_ECOFLOW_ACCESS_KEY + AVA_ECOFLOW_SECRET_KEY",
    });
  }

  const prev = loadEcoSnapshot() || {};
  let sns = configuredSerials();
  const noteParts = [];
  let batteryPct = prev.batteryPct ?? null;
  let devices = prev.devices || [];

  // 1) MQTT certification bucket (Open API) — no SN required on some regions
  try {
    const cert = await ecoflowGet("/iot-open/sign/certification", {});
    if (cert.ok && cert.json?.data) {
      const d = cert.json.data;
      writeJson(path.join(ecoBucketsRoot(), "mqtt", "certification.json"), {
        at: Date.now(),
        url: d.url,
        port: d.port,
        protocol: d.protocol,
        certificateAccount: d.certificateAccount,
        // keep password on disk for runtime MQTT only — handoff data is local
        certificatePassword: d.certificatePassword,
      });
      noteParts.push("mqtt cert ok");
    } else {
      noteParts.push(`mqtt cert ${cert.status}: ${(cert.json?.message || cert.text || "").slice(0, 80)}`);
    }
  } catch (err) {
    noteParts.push(`mqtt cert err: ${err.message}`);
  }

  // 2) Device list
  try {
    const list = await ecoflowGet("/iot-open/sign/device/list", {});
    if (list.ok && list.json?.data) {
      const rows = Array.isArray(list.json.data)
        ? list.json.data
        : list.json.data?.devices || list.json.data?.list || [];
      devices = rows.map((r) => ({
        sn: r.sn || r.deviceSn || r.serialNumber,
        productName: r.productName || r.productType || r.name,
        online: r.online ?? r.status,
      }));
      writeJson(path.join(ecoBucketsRoot(), "devices", "list.json"), {
        at: Date.now(),
        devices,
      });
      noteParts.push(`devices ${devices.length}`);
    } else {
      noteParts.push(`device list ${list.status}: ${(list.json?.message || list.text || "").slice(0, 80)}`);
    }
  } catch (err) {
    noteParts.push(`device list err: ${err.message}`);
  }

  // 3) Quota per SN — env first, else serials discovered from device list
  if (!sns.length && devices.length) {
    sns = devices.map((d) => String(d.sn || "").trim()).filter(Boolean);
    if (sns.length) noteParts.push("sns from device list");
  }
  if (!sns.length) {
    return saveEcoSnapshot({
      status: "needs_sn",
      batteryPct,
      devices,
      buckets: ecoBucketsRoot(),
      baseUrl: baseUrl(),
      note: `${noteParts.join(" · ")} · keys live — give Ava AVA_ECOFLOW_SN (comma-separated)`,
    });
  }

  const perSn = {};
  for (const sn of sns) {
    try {
      const q = await ecoflowGet("/iot-open/sign/device/quota/all", { sn });
      writeJson(path.join(ecoBucketsRoot(), "quota", `${sn}.json`), {
        at: Date.now(),
        status: q.status,
        body: q.json,
      });
      if (q.ok && q.json?.data) {
        const data = q.json.data;
        const soc = pickSoc(data);
        const power = pickPowerWatts(data);
        perSn[sn] = { ok: true, soc, ...power };
        if (soc != null) batteryPct = soc;
        appendHistory(sn, {
          soc,
          ...power,
          keys: Object.keys(data).slice(0, 24),
        });
        appendMinuteTotals(sn, { soc, ...power });
        noteParts.push(
          `${sn} quota ok` +
            (soc != null ? ` soc=${soc}%` : "") +
            (power.outW != null ? ` out=${power.outW}W` : ""),
        );
      } else {
        perSn[sn] = {
          ok: false,
          message: q.json?.message || q.text?.slice(0, 100),
        };
        noteParts.push(`${sn} quota ${q.status}`);
      }
    } catch (err) {
      perSn[sn] = { ok: false, message: err.message };
      noteParts.push(`${sn} err`);
    }
  }

  return saveEcoSnapshot({
    status: "live",
    batteryPct,
    devices,
    perSn,
    sns,
    nicknames: ECO_NICKNAMES,
    buckets: ecoBucketsRoot(),
    baseUrl: baseUrl(),
    note: noteParts.join(" · "),
  });
}

export function moodFromPower(snap) {
  const pct = snap?.batteryPct;
  if (pct == null) return "neutral";
  if (pct >= 70) return "upbeat";
  if (pct >= 35) return "focused";
  return "power_saver";
}

export function gatherEcoBrief() {
  const snap = loadEcoSnapshot();
  let solarLine = "";
  try {
    // Lazy import avoided — solar brief merged in recommend; keep eco brief lean.
    const p = path.join(storePaths().dir, "solar-profile.json");
    if (fs.existsSync(p)) {
      const s = JSON.parse(fs.readFileSync(p, "utf8"));
      const panels = s?.panels?.count ?? "?";
      const circuits = s?.panels?.circuits ?? "?";
      const batteries = s?.batteries?.count ?? "?";
      solarLine = `host solar profile: ${panels} panels / ${circuits} circuits / ${batteries} batteries`;
    }
  } catch {
    /* ignore */
  }
  if (!snap) {
    return {
      brief: `### Power (EcoFlow)\n(no snapshot yet)${solarLine ? `\n${solarLine}` : ""}`,
    };
  }
  const snLine = snap.sns?.length
    ? `sns: ${snap.sns.join(", ")}`
    : "sns: (waiting — operator will provide)";
  const perLines = Object.entries(snap.perSn || {})
    .map(([sn, v]) => {
      if (!v?.ok) return `  ${sn}: FAIL ${v?.message || "?"}`;
      const bits = [
        v.soc != null ? `soc=${v.soc}%` : null,
        v.inW != null ? `in=${v.inW}W` : null,
        v.outW != null ? `out=${v.outW}W` : null,
        v.solarW != null ? `solar=${v.solarW}W` : null,
      ].filter(Boolean);
      return `  ${sn}: ${bits.join(" ") || "ok"}`;
    })
    .join("\n");
  const nick =
    "nicknames: cucumbers→Delta2 R331ZAB5SG6S2858 · shackas→River2Pro R621ZA16XH6K1155";
  return {
    brief: `### Power (EcoFlow)
status: ${snap.status || "?"} · battery: ${snap.batteryPct != null ? `${snap.batteryPct}%` : "unknown"} · mood hint: ${moodFromPower(snap)}
${snLine}
${nick}
${perLines}
${solarLine}
buckets: ${snap.buckets || ecoBucketsRoot()} (quota + minute watt totals)
${snap.note || ""}
quirk: River2Pro (shackas) may show online:0 while perSn SOC/watts still populate — prefer perSn over online flag.
Solar/low-power: prefer lighter digs when power_saver or cloudy.`,
    snapshot: snap,
  };
}
