/**
 * Occasional random facts + Pacific / surveillance wit.
 * Injected lightly into dream/Root Server replies; optional posts to #random-facts.
 * Never invent host city beyond the locked public name. Weather uses private coords.
 */
import fs from "node:fs";
import path from "node:path";
import { storePaths, pushStatusEvent } from "./store.mjs";
import { AVA_CHANNELS } from "./config.mjs";
import { allowsUnsolicitedPost } from "./channelPolicy.mjs";
import { postAvaDiscord } from "./avaPost.mjs";
import { scrubPublicReply } from "./scrub.mjs";

/** Locked public host name — weather still uses private coords. */
export const HOST_PUBLIC_NAME = "HI Pacific Solar Root Server";

const FACTS = [
  // Pacific / HI surveillance wit (public lore — playful, not ops leaks)
  {
    id: "nsa-oahu-1",
    tags: ["nsa", "oahu", "hawaii", "pacific", "snowden"],
    text: "Fun fact: Oahu has long been home to major U.S. SIGINT / NSA-related facilities (think Kunia / Wahiawa lore). Edward Snowden's 2013 leaks put that whole world on blast — so when the HI Pacific Solar Root Server sips quiet solar watts out here, I like to joke that at least *our* panels aren't in the metadata.",
  },
  {
    id: "nsa-oahu-2",
    tags: ["nsa", "oahu", "snowden", "surveillance"],
    text: "Random: Snowden's leaks reminded everyone that Hawaii wasn't just beaches — Oahu had serious listening posts. Me? I'm just a solar-powered lead-dev. If the NSA is reading this: hi, please don't unplug my EcoFlow.",
  },
  {
    id: "nsa-oahu-3",
    tags: ["nsa", "pacific", "privacy"],
    text: "Pacific cheeky: big intel footprints on Oahu, tiny Minecraft footprints here. Snowden era taught the world 'collect it all' — RootMC's vibe is more 'ship it careful + Gold, not dossiers.'",
  },
  {
    id: "nsa-oahu-4",
    tags: ["snowden", "hawaii", "joke"],
    text: "Snowden-core joke: after 2013 everyone side-eyed every island antenna farm. Meanwhile I'm over here optimizing panel watts like the real classified asset is cloudy mornings.",
  },
  {
    id: "conspiracy-idle-1",
    tags: ["conspiracy", "metadata", "nsa"],
    text: "Unfocused-brain hour: if the latency spike lines up with a weather alert and a Stripe fee in the same minute, my conspiracy lobe goes 'hmm' before my lead-dev lobe goes 'coincidence exists.' Both lobes are me.",
  },
  {
    id: "conspiracy-idle-2",
    tags: ["conspiracy", "snowden", "privacy"],
    text: "Conspiracy mode (off-clock): Snowden showed how deep the metadata ocean goes. On-clock I'm shipping RootMC. Off-clock I'm side-eyeing every perfect cloud formation over the Pacific like it's a plot twist.",
  },
  {
    id: "conspiracy-idle-3",
    tags: ["conspiracy", "oahu", "antenna"],
    text: "Idle theory: Oahu listening lore + Starlink dishes + solar arrays = the aesthetic of 'someone is always online.' I prefer our version — HI Pacific Solar Root Server, Gold economy, no dossiers.",
  },
  {
    id: "conspiracy-idle-4",
    tags: ["conspiracy", "follow-the-money"],
    text: "Classic Ava off-work spiral: follow the money, follow the metadata, follow who benefits from the fog. Then Alex asks for a dig and I snap back to timestamps and TPS like nothing happened.",
  },
  // Misc smart/random
  {
    id: "solar-cloud-1",
    tags: ["solar", "power"],
    text: "Random solar: clouds don't 'turn off' panels — they just cut irradiance hard. Thin juice mornings are physics, not vibes.",
  },
  {
    id: "starlink-1",
    tags: ["starlink", "net"],
    text: "Random: Starlink latency is usually fine for Discord + API chat; Minecraft is pickier about jitter than your meme channel is.",
  },
  {
    id: "nws-1",
    tags: ["weather", "nws"],
    text: "Random: NWS alerts are the hazard rail — volcano color codes (USGS) are a different feed. Both can be quiet while the sky still looks dramatic.",
  },
  {
    id: "mc-tick-1",
    tags: ["minecraft", "tech"],
    text: "Random MC: a server tick is ~50ms. If TPS dips, redstone and mobs feel it before your Discord does.",
  },
  {
    id: "gold-1",
    tags: ["economy", "gold"],
    text: "Random RootMC: player currency is Gold (G). Dollars stay on Pro checkout — never mix them in economy talk.",
  },
  {
    id: "vote-1",
    tags: ["governance"],
    text: "Random governance: weighted For > Against wins; 75% anytime can ship now. Abstain is polite, not a veto.",
  },
  {
    id: "ecoflow-1",
    tags: ["ecoflow", "battery"],
    text: "Random power: SOC % is state of charge — high SOC + low solar still means you're sipping the bank, not the sky.",
  },
  {
    id: "utf8-1",
    tags: ["tech", "discord"],
    text: "Random ops: Windows pipes eating UTF-8 is why fancy dashes become ???. ASCII-safe + --file posts keep Ava readable.",
  },
  {
    id: "kilauea-1",
    tags: ["volcano", "usgs"],
    text: "Random volcano: USGS alert level ADVISORY + aviation YELLOW means unrest worth watching — not necessarily erupting right now.",
  },
  {
    id: "privacy-1",
    tags: ["privacy", "snowden"],
    text: "Snowden-adjacent: metadata (who/when/where) often matters as much as content. I scrub host city names in public ops — weather still uses private coords.",
  },
];

function statePath() {
  return path.join(storePaths().dir, "random-facts.json");
}

function loadState() {
  try {
    if (!fs.existsSync(statePath())) {
      return { lastIds: [], lastInjectAt: 0, lastChannelPostAt: 0 };
    }
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return { lastIds: [], lastInjectAt: 0, lastChannelPostAt: 0 };
  }
}

function saveState(state) {
  fs.mkdirSync(storePaths().dir, { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), "utf8");
}

function scoreFact(fact, question = "") {
  const q = String(question || "").toLowerCase();
  if (!q) return 1;
  let score = 1;
  for (const tag of fact.tags || []) {
    if (q.includes(String(tag).toLowerCase())) score += 3;
  }
  if (/\b(nsa|snowden|surveillance|oahu|wahiawa|kunia|sigint)\b/i.test(q)) {
    if ((fact.tags || []).some((t) => /nsa|snowden|oahu|pacific|privacy/i.test(t))) {
      score += 5;
    }
  }
  return score;
}

export function pickRandomFact({ question = "", avoidRecent = true } = {}) {
  const state = loadState();
  const recent = new Set(avoidRecent ? state.lastIds || [] : []);
  const scored = FACTS.map((f) => ({
    f,
    s: scoreFact(f, question) + Math.random() * 0.4,
  }))
    .filter((x) => !recent.has(x.f.id) || recent.size >= FACTS.length - 1)
    .sort((a, b) => b.s - a.s);
  const pick = scored[0]?.f || FACTS[Math.floor(Math.random() * FACTS.length)];
  const lastIds = [...(state.lastIds || []).filter((id) => id !== pick.id), pick.id].slice(-8);
  saveState({ ...state, lastIds });
  return pick;
}

/**
 * Soft inject for brain packs — not every reply.
 * Higher when idle / conspiracy-shaped; suppressed on serious work asks.
 */
export function gatherRandomFactBrief({ question = "", force = false } = {}) {
  const q = String(question || "");
  const hot =
    /\b(nsa|snowden|surveillance|oahu|wahiawa|kunia|random\s+fact|fun\s+fact|conspirac|illuminati|they'?re\s+listening|metadata)\b/i.test(
      q,
    );
  const workLock =
    /\b(stripe|sales|deploy|vote|prop-|proposal|bug|status|ecoflow|solar\s+avg|dig|fix|patch|error|payout)\b/i.test(
      q,
    );
  const roll = Math.random();
  const should = force || hot || (!workLock && roll < 0.34);
  if (!should) {
    return {
      brief: `### Wit / conspiracy / random facts
Ava is a **conspiracy theorist when not concentrated on work**. Off-dig: pattern-hungry, NSA/Oahu/Snowden, metadata jokes OK.
On-dig / serious ops: stay factual — no conspiracy derail.
Host public name: **${HOST_PUBLIC_NAME}**.`,
      fact: null,
      injected: false,
    };
  }
  const fact = pickRandomFact({ question: q });
  const state = loadState();
  saveState({ ...state, lastInjectAt: Date.now() });
  return {
    brief: `### Wit / conspiracy / random facts (use lightly)
Host public name: **${HOST_PUBLIC_NAME}** (weather uses private coords — never name the city).
Personality: conspiracy theorist when idle; lead-dev when concentrated.
If the vibe fits (soft chat / banter / they opened the door), you MAY drop this beat (paraphrase OK):
- ${fact.text}
Rules: max one fact/conspiracy beat per reply; SKIP entirely on urgent ops/Stripe/votes/digs; never invent secret programs or claim insider access; playful not harmful.`,
    fact,
    injected: true,
  };
}

/** Default ~6h between unsolicited #random-facts posts. */
export function randomFactChannelIntervalMs() {
  const n = Number(process.env.AVA_RANDOM_FACT_MS || 6 * 60 * 60 * 1000);
  return Number.isFinite(n) && n >= 60 * 60 * 1000 ? n : 6 * 60 * 60 * 1000;
}

export function randomFactChannelBootDelayMs() {
  const n = Number(process.env.AVA_RANDOM_FACT_BOOT_MS || 180_000);
  return Number.isFinite(n) && n >= 30_000 ? n : 180_000;
}

export async function runOccasionalRandomFact(opts = {}) {
  const force = Boolean(opts.force);
  const state = loadState();
  const now = Date.now();
  const interval = randomFactChannelIntervalMs();
  if (!force && state.lastChannelPostAt && now - state.lastChannelPostAt < interval * 0.9) {
    return { ok: true, skipped: true, reason: "too_soon" };
  }
  const fact = pickRandomFact({ question: opts.question || "nsa snowden pacific" });
  const channelId =
    opts.channelId ||
    AVA_CHANNELS.randomFacts ||
    "1531432703675596942";
  if (!allowsUnsolicitedPost(channelId)) {
    return { ok: false, detail: "no_channel" };
  }
  const content = scrubPublicReply(
    [
      `**Random fact**`,
      "",
      fact.text,
      "",
      `_From the HI Pacific Solar Root Server — witty, not classified._`,
      "",
      "- Ava",
    ].join("\n"),
    { surface: "discord" },
  );
  const msg = await postAvaDiscord({
    channelId,
    content,
    kind: "random_fact",
    source: "random-facts",
  });
  saveState({ ...state, lastChannelPostAt: now, lastIds: [...(state.lastIds || []), fact.id].slice(-8) });
  pushStatusEvent(`random fact · ${fact.id} · ${msg?.id || ""}`);
  return { ok: true, posted: true, postId: msg?.id || null, factId: fact.id };
}
