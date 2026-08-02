/**
 * Ops power-status asks — voting shares + EcoFlow/solar.
 * When Cursor is online, Discord may answer these from live Root Server packs
 * (bypasses dream-only + cloud-dark silence). Not a plugin dig / jar ship.
 */
import {
  refreshEcoFlow,
  gatherEcoBrief,
  loadEcoSnapshot,
  moodFromPower,
} from "./ecoflow.mjs";
import { gatherSolarBrief, loadSolarProfile } from "./solarProfile.mjs";
import { gatherGovernanceBrief, getCouncil, listOpenPolls } from "./governanceClient.mjs";

const NICK_BY_SN = {
  R331ZAB5SG6S2858: "cucumbers",
  R331ZAB5SG755642: "Delta 2-B",
  R621ZA16XH6K1155: "shackas",
};

/**
 * True for live power / voting-share status asks (not solar-circus digs).
 */
export function isOpsPowerStatusAsk(question = "") {
  const q = String(question || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!q) return false;
  // Explicit dual ask (what Alex just pinged)
  if (
    /\b(power\s+status|battery|soc|ecoflow|solar)\b/.test(q) &&
    /\b(vot(?:e|ing)|percent|share|council|prop[-\s]?\d+)\b/.test(q)
  ) {
    return true;
  }
  if (
    /\b(ecoflow|solar\s*(?:status|bank|array|panels?)|battery\s*(?:pct|percent|bank|status)|power\s+status|host\s+power)\b/.test(
      q,
    )
  ) {
    return true;
  }
  if (
    /\b(voting\s+(?:power|shares?|percentages?)|council\s+shares?|vote\s+shares?)\b/.test(q)
  ) {
    return true;
  }
  if (
    /\b(cucumbers|shackas|delta\s*2|river\s*2)\b/.test(q) &&
    /\b(soc|battery|solar|watts?|charge|status|power)\b/.test(q)
  ) {
    return true;
  }
  return false;
}

function snLabel(sn, snap) {
  const nicks = snap?.nicknames || {};
  for (const [nick, serial] of Object.entries(nicks)) {
    if (String(serial) === String(sn) && !/^(delta-2|river)/i.test(nick)) {
      return nick;
    }
  }
  return NICK_BY_SN[sn] || sn.slice(-6);
}

function fmtW(n) {
  if (n == null || Number.isNaN(Number(n))) return "?";
  return `${Math.round(Number(n))}W`;
}

/**
 * Live reply from EcoFlow refresh + governance API. Numbers only from packs.
 */
export async function buildOpsPowerStatusReply({ authorId = "" } = {}) {
  let snap = null;
  try {
    snap = await refreshEcoFlow();
  } catch {
    snap = loadEcoSnapshot();
  }
  if (!snap) snap = loadEcoSnapshot();

  const [gov, council, polls] = await Promise.all([
    gatherGovernanceBrief({ discordUserId: authorId || undefined }).catch(() => ({
      brief: "",
    })),
    getCouncil().catch(() => null),
    listOpenPolls().catch(() => null),
  ]);
  const solar = loadSolarProfile();
  const panels = solar?.panels?.count ?? 10;
  const circuits = solar?.panels?.circuits ?? 2;
  const batteries = solar?.batteries?.count ?? 3;

  const lines = ["**Power status** · live just now", ""];

  // Council shares
  const councilRows = Array.isArray(council?.council) ? council.council : [];
  if (councilRows.length) {
    lines.push(
      `**Council voting shares** (eligible ${council.eligible_count ?? councilRows.length})`,
    );
    for (const c of councilRows.slice(0, 8)) {
      const name = c.minecraft_username || "?";
      const share = c.share_percent != null ? Number(c.share_percent).toFixed(2) : "?";
      const you =
        authorId &&
        gov?.power?.ok &&
        String(gov.power.minecraft_username || "").toLowerCase() ===
          String(name).toLowerCase()
          ? " (you)"
          : name === "Ava Ivy"
            ? " (Alex→Ava seat)"
            : "";
      lines.push(`• ${name} — **${share}%**${you}`);
    }
    lines.push("");
  } else if (gov?.brief) {
    lines.push(gov.brief.split("\n").slice(0, 8).join("\n"), "");
  }

  // Open polls (weighted %)
  const open = Array.isArray(polls?.polls) ? polls.polls : [];
  if (open.length) {
    for (const p of open.slice(0, 4)) {
      const forPct = p.weighted_for_pct ?? "?";
      const againstPct = p.weighted_against_pct ?? "?";
      lines.push(
        `Open **${p.id}** (${String(p.title || "").slice(0, 48)}): weighted **for ${forPct}%** / against ${againstPct}%`,
      );
    }
    lines.push("");
  }

  // EcoFlow
  const mood = moodFromPower(snap);
  const bank =
    snap?.batteryPct != null ? `**${snap.batteryPct}%** overall · ${mood}` : "unknown";
  lines.push("**EcoFlow / solar**");
  lines.push(`• Bank mood: ${bank}`);

  const per = snap?.perSn || {};
  let solarTotal = 0;
  for (const [sn, v] of Object.entries(per)) {
    if (!v?.ok) {
      lines.push(`• ${snLabel(sn, snap)}: FAIL ${v?.message || "?"}`);
      continue;
    }
    if (v.solarW != null) solarTotal += Number(v.solarW) || 0;
    const bits = [
      v.soc != null ? `SOC **${v.soc}%**` : null,
      v.inW != null ? `in ${fmtW(v.inW)}` : null,
      v.outW != null ? `out ${fmtW(v.outW)}` : null,
      v.solarW != null ? `solar ${fmtW(v.solarW)}` : null,
    ].filter(Boolean);
    lines.push(`• **${snLabel(sn, snap)}**: ${bits.join(" · ") || "ok"}`);
  }
  if (!Object.keys(per).length) {
    lines.push("• EcoFlow snapshot empty — keys/sns may still be wiring up");
  }

  lines.push(
    `• Host array: **${panels} panels / ${circuits} circuits / ${batteries} batteries**` +
      (solarTotal > 0 ? ` · ~${Math.round(solarTotal)}W solar in right now` : ""),
  );

  if (String(snap?.note || "").includes("online:0") || per.R621ZA16XH6K1155) {
    // Quirk note only if shackas present
    const shackas = per.R621ZA16XH6K1155;
    if (shackas?.ok) {
      lines.push(
        "• shackas online-flag can lie — SOC/watts above are from quota (trust those)",
      );
    }
  }

  lines.push("", "— Ava");
  return lines.join("\n");
}

/** Packs for Cursor/dream when not using the deterministic formatter. */
export function gatherOpsPowerPacks() {
  const eco = gatherEcoBrief();
  const solar = gatherSolarBrief();
  return [eco.brief, solar.brief].filter(Boolean).join("\n\n");
}
