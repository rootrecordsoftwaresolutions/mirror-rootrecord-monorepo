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

  const url = new URL(`${baseUrl()}${apiPath}`);
  for (const [k, v] of Object.entries(flatParams)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method: "GET",
    headers: {
      accessKey: key,
      nonce,
      timestamp,
      sign,
      "Content-Type": "application/json",
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
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 500) };
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
  ];
  for (const c of candidates) {
    if (c != null && !Number.isNaN(Number(c))) return Number(c);
  }
  // nested walk for common keys
  for (const [k, v] of Object.entries(data)) {
    if (/soc|battery.*pct|batt.*soc/i.test(k) && typeof v === "number") return v;
  }
  return null;
}

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
  const sns = configuredSerials();
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

  // 3) Quota per configured SN (operator will supply serials)
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
        const soc = pickSoc(q.json.data);
        perSn[sn] = { ok: true, soc };
        if (soc != null) {
          batteryPct = soc;
          appendHistory(sn, { soc, keys: Object.keys(q.json.data).slice(0, 20) });
        }
        noteParts.push(`${sn} quota ok`);
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
  if (!snap) {
    return { brief: "### Power (EcoFlow)\n(no snapshot yet)" };
  }
  const snLine = snap.sns?.length
    ? `sns: ${snap.sns.join(", ")}`
    : "sns: (waiting — operator will provide)";
  return {
    brief: `### Power (EcoFlow)
status: ${snap.status || "?"} · battery: ${snap.batteryPct != null ? `${snap.batteryPct}%` : "unknown"} · mood hint: ${moodFromPower(snap)}
${snLine}
buckets: ${snap.buckets || ecoBucketsRoot()}
${snap.note || ""}
Solar/low-power: prefer lighter digs when power_saver.`,
    snapshot: snap,
  };
}
