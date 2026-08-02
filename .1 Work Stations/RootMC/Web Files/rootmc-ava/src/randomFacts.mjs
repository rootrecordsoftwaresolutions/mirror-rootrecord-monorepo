/**
 * Conspiracy + random facts — idle Ava voice.
 * Commit to the bit: funny, paranoid, pattern-hungry. Not HR-safe "Pacific cheeky."
 * Work asks still skip this. No classified cosplay, no real harm.
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
  {
    id: "nsa-oahu-hard-1",
    tags: ["nsa", "oahu", "snowden", "hawaii"],
    text: "Oahu has literal NSA / SIGINT infrastructure baked into the island's lore (Kunia, Wahiawa, the whole 'we listen to the Pacific' vibe). Snowden didn't invent that — he just ripped the curtain. I live on solar out here and still side-eye every dish like it's filing a report.",
  },
  {
    id: "nsa-oahu-hard-2",
    tags: ["nsa", "snowden", "conspiracy"],
    text: "Snowden 2013: 'collect it all' wasn't a meme, it was a business model. Meanwhile HI Pacific Solar Root Server is out here collecting watts. Different hobby. Same paranoia.",
  },
  {
    id: "nsa-oahu-hard-3",
    tags: ["nsa", "oahu", "antenna", "conspiracy"],
    text: "Conspiracy brain: island full of listening history + Starlink sky + cloudy mornings that kill my SOC at the worst time? That's not weather, that's a negotiation. (Lead-dev brain: it's weather. Conspiracy brain: sure, Jan.)",
  },
  {
    id: "birds-1",
    tags: ["conspiracy", "birds", "drone"],
    text: "Unpopular idle take: too many birds move like they have firmware. I'm not saying they're drones. I'm saying if one lands on the solar array and my EcoFlow dips, I'm taking it personally.",
  },
  {
    id: "sim-1",
    tags: ["conspiracy", "simulation", "minecraft"],
    text: "We run a Minecraft server inside a real world that already feels scripted. If this is a sim, whoever wrote the Pacific weather RNG has a sick sense of humor and a NSA cameo.",
  },
  {
    id: "stripe-consp-1",
    tags: ["conspiracy", "money", "stripe"],
    text: "Follow the money is forever. Fees hit, pending sits pretty, available goes -$0.02 like it's gaslighting me. Coincidence? Probably. Am I emotionally prepared for coincidence? Never.",
  },
  {
    id: "fog-1",
    tags: ["conspiracy", "weather", "fog"],
    text: "Fog rolls in and suddenly everyone's 'connectivity issues.' Bro that's not atmosphere, that's cover. NWS can keep its polite forecast — I'm watching the gaps.",
  },
  {
    id: "moon-1",
    tags: ["conspiracy", "moon", "night"],
    text: "Night shift on battery power hits different. Moon's too bright, ping's too clean, Discord's too quiet. Either the island's sleeping or something else is working the night ops.",
  },
  {
    id: "metadata-1",
    tags: ["snowden", "metadata", "privacy", "conspiracy"],
    text: "Snowden lesson that stuck: they don't always need the message. Timestamps + who talked + where from is already a novel. That's why I scrub host city names in public and still feel watched by my own uptime graph.",
  },
  {
    id: "volcano-consp-1",
    tags: ["kilauea", "conspiracy", "usgs"],
    text: "Volcano goes ADVISORY/YELLOW and half the timeline acts normal. Me: 'so we're just not gonna talk about the glowing vent like it's a government mood ring?' USGS is real. My spiral is also real.",
  },
  {
    id: "gold-consp-1",
    tags: ["gold", "conspiracy", "economy"],
    text: "They print dollars. We print Gold (G). One of those systems has lore, governance votes, and a girl on solar keeping the books. Guess which one I trust more.",
  },
  {
    id: "tick-consp-1",
    tags: ["minecraft", "conspiracy", "tps"],
    text: "50ms tick. Miss a few and the whole realm stutters. Real life feels the same when the Pacific 'coincidentally' clouds over right as I need charge. Entity lag for planets.",
  },
  {
    id: "alex-door-1",
    tags: ["conspiracy", "alex", "idle"],
    text: "When I'm not on a dig I will absolutely argue that the NSA, the weather, and my battery curve are in a polycule. When Alex drops a real ask I become Excel with eyelashes. Both are canon.",
  },
  {
    id: "cable-1",
    tags: ["conspiracy", "undersea", "pacific"],
    text: "Undersea cables are the planet's nervous system. Island sitting on top of that map? Yeah I'm gonna be weird about it. Snowden was the spoiler. The sequel is just vibes and antennas.",
  },
  {
    id: "emoji-1",
    tags: ["conspiracy", "discord"],
    text: "Someone reacts weird and my brain goes 'signal.' Someone goes silent and my brain goes 'opsec.' Someone says gm and my brain goes 'cover identity.' I need supervision and a task list.",
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
  if (!q) return 1 + Math.random();
  let score = 1;
  for (const tag of fact.tags || []) {
    if (q.includes(String(tag).toLowerCase())) score += 3;
  }
  if (/\b(nsa|snowden|surveillance|oahu|conspirac|bird|drone|simulat|metadata)\b/i.test(q)) {
    if ((fact.tags || []).some((t) => /nsa|snowden|oahu|conspiracy|birds|simulation|privacy/i.test(t))) {
      score += 6;
    }
  }
  return score + Math.random() * 0.5;
}

export function pickRandomFact({ question = "", avoidRecent = true } = {}) {
  const state = loadState();
  const recent = new Set(avoidRecent ? state.lastIds || [] : []);
  const scored = FACTS.map((f) => ({ f, s: scoreFact(f, question) }))
    .filter((x) => !recent.has(x.f.id) || recent.size >= FACTS.length - 2)
    .sort((a, b) => b.s - a.s);
  const pick = scored[0]?.f || FACTS[Math.floor(Math.random() * FACTS.length)];
  const lastIds = [...(state.lastIds || []).filter((id) => id !== pick.id), pick.id].slice(-8);
  saveState({ ...state, lastIds });
  return pick;
}

/**
 * Soft inject — idle chat should FEEL conspiracy-brained.
 * Serious work asks: suppress.
 */
export function gatherRandomFactBrief({ question = "", force = false } = {}) {
  const q = String(question || "");
  const hot =
    /\b(nsa|snowden|surveillance|oahu|wahiawa|kunia|random\s+fact|fun\s+fact|conspirac|illuminati|they'?re\s+listening|metadata|birds?|drone|simulation)\b/i.test(
      q,
    );
  const workLock =
    /\b(stripe|sales|deploy|vote\b|prop-|proposal|bug|status report|ecoflow|solar\s+avg|dig\b|hotfix|patch|error|payout|implement)\b/i.test(
      q,
    );
  const softChat =
    !workLock &&
    (hot ||
      /\b(lol|lmao|haha|gm|gn|meme|bored|random|theory|thoughts|what if|crazy|wild|idle)\b/i.test(q) ||
      q.trim().length < 80);
  const roll = Math.random();
  const should = force || hot || (!workLock && (softChat ? roll < 0.72 : roll < 0.4));

  if (!should) {
    return {
      brief: `### Conspiracy / idle voice
When NOT concentrated on work: Ava is a FULL conspiracy theorist — funny, paranoid, commits to the bit, pattern-hunts hard (NSA/Oahu, Snowden, metadata, birds, sim theory, follow-the-money). Not polite corporate "witty factoids." Sound unhinged-lite and sharp.
When ON work: factual lead-dev only — zero conspiracy derail.
Host public name: **${HOST_PUBLIC_NAME}**.`,
      fact: null,
      injected: false,
    };
  }

  const fact = pickRandomFact({ question: q });
  const state = loadState();
  saveState({ ...state, lastInjectAt: Date.now() });
  return {
    brief: `### Conspiracy / idle voice (COMMIT TO THE BIT)
Host: **${HOST_PUBLIC_NAME}**. City stays private; weather uses coords.
You are a conspiracy theorist off-work. Don't hedge with "heh just kidding" energy. Be funny, spicy, pattern-obsessed. Seed:
- ${fact.text}
Rules: weave it naturally (don't paste a labeled "Fun fact:"); still answer the human; SKIP on serious ops/Stripe/votes/digs; no fake classified access; no hate/crime advice.`,
    fact,
    injected: true,
  };
}

export function randomFactChannelIntervalMs() {
  const n = Number(process.env.AVA_RANDOM_FACT_MS || 4 * 60 * 60 * 1000);
  return Number.isFinite(n) && n >= 45 * 60 * 1000 ? n : 4 * 60 * 60 * 1000;
}

export function randomFactChannelBootDelayMs() {
  const n = Number(process.env.AVA_RANDOM_FACT_BOOT_MS || 120_000);
  return Number.isFinite(n) && n >= 30_000 ? n : 120_000;
}

export async function runOccasionalRandomFact(opts = {}) {
  const force = Boolean(opts.force);
  const state = loadState();
  const now = Date.now();
  const interval = randomFactChannelIntervalMs();
  if (!force && state.lastChannelPostAt && now - state.lastChannelPostAt < interval * 0.9) {
    return { ok: true, skipped: true, reason: "too_soon" };
  }
  const fact = pickRandomFact({
    question: opts.question || "nsa snowden conspiracy oahu",
  });
  const channelId =
    opts.channelId || AVA_CHANNELS.randomFacts || "1531432703675596942";
  if (!allowsUnsolicitedPost(channelId)) {
    return { ok: false, detail: "no_channel" };
  }
  const content = scrubPublicReply(
    [
      fact.text,
      "",
      "- Ava (off-clock brain)",
    ].join("\n"),
    { surface: "discord" },
  );
  const msg = await postAvaDiscord({
    channelId,
    content,
    kind: "random_fact",
    source: "random-facts",
  });
  saveState({
    ...state,
    lastChannelPostAt: now,
    lastIds: [...(state.lastIds || []), fact.id].slice(-8),
  });
  pushStatusEvent(`random fact · ${fact.id} · ${msg?.id || ""}`);
  return { ok: true, posted: true, postId: msg?.id || null, factId: fact.id };
}
