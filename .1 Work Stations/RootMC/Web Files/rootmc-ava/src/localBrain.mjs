/**
 * Local organizer brain (Goal B3) — Ollama/llama-class on OptiPlex SSD.
 * Classifies + answers from small packs. Escalates when unknown:
 *   Cursor Root Server if online → else dream (Grok under the hood).
 * Every escalation/hit is saved as training until the Ava core can absorb it.
 */
import fs from "node:fs";
import path from "node:path";
import {
  AVA_HANDOFF,
  cursorApiKey,
  dreamApiKey,
  WORKSPACE_ROOT,
} from "./config.mjs";
import { AVA_HARD_RULES, AVA_PERSONA } from "./persona.mjs";
import { gatherCoreSpec } from "./coreSpec.mjs";
import { gatherJobsBrief } from "./jobQueue.mjs";
import { scrubPublicReply } from "./scrub.mjs";
import { cursorRecommend } from "./cursorBrain.mjs";
import { dreamRecommend } from "./dreamBrain.mjs";
import { logDigTraining, appendAction } from "./fullLog.mjs";
import { storePaths } from "./store.mjs";

const DEFAULT_OLLAMA = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "ava-ivy";

export function ollamaBaseUrl(env = {}) {
  return String(
    process.env.AVA_OLLAMA_URL ||
      env.AVA_OLLAMA_URL ||
      DEFAULT_OLLAMA,
  )
    .trim()
    .replace(/\/$/, "");
}

export function ollamaModel(env = {}) {
  return String(
    process.env.AVA_OLLAMA_MODEL ||
      env.AVA_OLLAMA_MODEL ||
      process.env.OLLAMA_MODEL ||
      DEFAULT_MODEL,
  ).trim();
}

/** Opt-in; set AVA_LOCAL_BRAIN=1 (or true) to use Ollama organizer on Slack/on-device. */
export function localBrainEnabled(env = {}) {
  const v = String(
    process.env.AVA_LOCAL_BRAIN || env.AVA_LOCAL_BRAIN || "",
  ).trim();
  if (v === "0" || /^false$/i.test(v)) return false;
  if (v === "1" || /^true$/i.test(v)) return true;
  // Auto: enabled when Ollama answers /api/tags (checked lazily by callers via probe)
  return v === "auto";
}

function trainingDir() {
  const dir = path.join(storePaths().dir, "training");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function pendingPath() {
  return path.join(trainingDir(), "pending-lessons.jsonl");
}

function darkStallCooldownPath() {
  return path.join(storePaths().dir, "dark-stall-cooldown.json");
}

const DARK_STALL_COOLDOWN_MS = Number(
  process.env.AVA_DARK_STALL_COOLDOWN_MS || 15 * 60_000,
);

function takeDarkStallReply(channelId = "") {
  const ch = String(channelId || "unknown");
  let map = {};
  try {
    map = JSON.parse(fs.readFileSync(darkStallCooldownPath(), "utf8"));
  } catch {
    map = {};
  }
  const last = Number(map[ch] || 0);
  const now = Date.now();
  if (last && now - last < DARK_STALL_COOLDOWN_MS) {
    return {
      text: "still dark on the deep dig — I already queued this. I'll catch it when the core's back; no more spam.",
      throttled: true,
    };
  }
  map[ch] = now;
  try {
    fs.mkdirSync(path.dirname(darkStallCooldownPath()), { recursive: true });
    fs.writeFileSync(
      darkStallCooldownPath(),
      JSON.stringify(map, null, 2),
      "utf8",
    );
  } catch {
    /* ignore */
  }
  return {
    text: "Root Server and dream state are both dark right now — I queued this for when my core is back online. Ping me again after the host wakes.",
    throttled: false,
  };
}

function lessonsPath() {
  return path.join(trainingDir(), "local-lessons.jsonl");
}

function appendJsonl(file, row) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, "utf8");
  } catch (err) {
    console.warn("localBrain train:", err.message);
  }
}

function scrubSecrets(text) {
  return String(text || "")
    .replace(/xox[baprs]-[A-Za-z0-9-]+/g, "[redacted-token]")
    .replace(/xapp-[A-Za-z0-9-]+/g, "[redacted-token]")
    .replace(
      /(?:api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    )
    .slice(0, 8000);
}

/** Small organizer packs only — never whole trees / secrets. */
export function gatherOrganizerPacks({ question = "" } = {}) {
  const chunks = [];
  const core = gatherCoreSpec({ maxChars: 8000 });
  if (core.brief) chunks.push(core.brief.slice(0, 8000));

  const jobs = gatherJobsBrief();
  if (jobs.brief) chunks.push(jobs.brief.slice(0, 2000));

  const goals = path.join(AVA_HANDOFF, "notes", "AVA-GOALS.md");
  const surface = path.join(
    WORKSPACE_ROOT,
    "Web Files",
    "rootmc-ava",
    "src",
    "surfaceRules.mjs",
  );
  // Prefer human-readable surface doc if present
  const surfaceMd = path.join(AVA_HANDOFF, "notes", "SURFACE-ARCHITECTURE.md");
  const eco = path.join(WORKSPACE_ROOT, "emergent-repo", "ECOSYSTEM.md");
  const layout = path.join(AVA_HANDOFF, "notes", "LINUX-E-SSD-LAYOUT.md");
  const localBrainDoc = path.join(AVA_HANDOFF, "notes", "LOCAL-BRAIN.md");
  const interestsDoc = path.join(
    AVA_HANDOFF,
    "notes",
    "INTERESTS-OFFGRID-GARDEN-POWER.md",
  );

  for (const file of [goals, surfaceMd, eco, layout, localBrainDoc, interestsDoc]) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, "utf8");
      const cleaned = raw
        .split(/\r?\n/)
        .filter(
          (line) =>
            !/(password|token|secret|api[_-]?key|jdbc:|Bearer\s)/i.test(line),
        )
        .join("\n");
      chunks.push(
        `### ${path.basename(file)}\n${cleaned.slice(0, 3500)}`,
      );
    } catch {
      /* skip */
    }
  }

  // Tiny surface rules extract (no full source dump)
  try {
    if (fs.existsSync(surface)) {
      const s = fs.readFileSync(surface, "utf8").slice(0, 2500);
      chunks.push(`### surfaceRules excerpt\n${s}`);
    }
  } catch {
    /* skip */
  }

  void question;
  return chunks.filter(Boolean).join("\n\n").slice(0, 14000);
}

let _ollamaOk = null;
let _ollamaCheckedAt = 0;

export async function probeOllama(env = {}) {
  const now = Date.now();
  if (_ollamaOk != null && now - _ollamaCheckedAt < 30_000) {
    return _ollamaOk;
  }
  try {
    const res = await fetch(`${ollamaBaseUrl(env)}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    _ollamaOk = res.ok;
  } catch {
    _ollamaOk = false;
  }
  _ollamaCheckedAt = now;
  return _ollamaOk;
}

/** True when local organizer should run (explicit enable or auto + Ollama up). */
export async function shouldUseLocalBrain(env = {}) {
  const v = String(
    process.env.AVA_LOCAL_BRAIN || env.AVA_LOCAL_BRAIN || "auto",
  ).trim();
  if (v === "0" || /^false$/i.test(v)) return false;
  if (v === "1" || /^true$/i.test(v)) return probeOllama(env);
  // auto (default for Ubuntu path)
  return probeOllama(env);
}

function parseLocalResponse(raw) {
  const text = String(raw || "").trim();
  const knowMatch = text.match(/\bKNOWS:\s*(yes|no)\b/i);
  const confMatch = text.match(/\bCONFIDENCE:\s*(high|medium|low)\b/i);
  const routeMatch = text.match(/\bROUTE:\s*(local|cursor|dream)\b/i);

  let reply = text
    .replace(/\bKNOWS:\s*(yes|no)\b/gi, "")
    .replace(/\bCONFIDENCE:\s*(high|medium|low)\b/gi, "")
    .replace(/\bROUTE:\s*(local|cursor|dream)\b/gi, "")
    .replace(/\bREPLY:\s*/i, "")
    .trim();

  const knows =
    knowMatch && /^yes$/i.test(knowMatch[1])
      ? true
      : knowMatch && /^no$/i.test(knowMatch[1])
        ? false
        : null;
  const confidence = (confMatch?.[1] || "").toLowerCase() || null;
  const routeHint = (routeMatch?.[1] || "").toLowerCase() || null;

  const unsurePhrase =
    /\b(i don'?t know|not sure|need (the )?root server|escalate|can'?t answer from packs|insufficient)\b/i.test(
      reply,
    );

  let shouldEscalate = false;
  if (knows === false) shouldEscalate = true;
  if (confidence === "low") shouldEscalate = true;
  if (routeHint === "cursor" || routeHint === "dream") shouldEscalate = true;
  if (unsurePhrase) shouldEscalate = true;
  if (knows === true && confidence === "high" && !unsurePhrase) {
    shouldEscalate = false;
  }
  if (!reply || reply.length < 8) shouldEscalate = true;

  return { reply, knows, confidence, routeHint, shouldEscalate };
}

async function ollamaChat({ system, user, env, numPredict = 700 }) {
  const model = ollamaModel(env);
  try {
    const res = await fetch(`${ollamaBaseUrl(env)}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.2, num_predict: numPredict },
        messages: [
          { role: "system", content: system.slice(0, 24000) },
          { role: "user", content: user.slice(0, 28000) },
        ],
      }),
      signal: AbortSignal.timeout(
        Number(process.env.AVA_OLLAMA_TIMEOUT_MS || 45_000) || 45_000,
      ),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, reason: `ollama_${res.status}`, text: null };
    }
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return { ok: false, reason: "ollama_bad_json", text: null };
    }
    const reply = data?.message?.content?.trim();
    if (!reply) return { ok: false, reason: "ollama_empty", text: null };
    return { ok: true, reason: "ok", text: reply, model };
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (/abort|timeout/i.test(msg) || err?.name === "TimeoutError") {
      return { ok: false, reason: "ollama_timeout", text: null };
    }
    return { ok: false, reason: "ollama_error", text: null };
  }
}

/**
 * Ava Llama context compressor — when Ollama is up, shrink packed context for
 * Root Server / dream digs so teachers burn fewer tokens.
 * Never invents facts; never includes secrets / customer PII.
 *
 * @returns {Promise<{ ok: boolean, packed: string, compressed: boolean, reason?: string, ratio?: number }>}
 */
export async function compressPacksForAsk({
  question = "",
  packed = "",
  env = {},
  maxOut = 9000,
  minIn = 10000,
} = {}) {
  const full = String(packed || "");
  const q = String(question || "").trim();
  if (!full || !q) {
    return { ok: true, packed: full, compressed: false, reason: "empty" };
  }
  if (full.length < minIn) {
    return {
      ok: true,
      packed: full,
      compressed: false,
      reason: "below_threshold",
      ratio: 1,
    };
  }

  const use = await shouldUseLocalBrain(env);
  if (!use) {
    return {
      ok: true,
      packed: full,
      compressed: false,
      reason: "ollama_down",
      ratio: 1,
    };
  }

  const system = [
    "You are **Ava Llama** — Ava Ivy's local context organizer (Ollama student).",
    "Your only job: compress the packs so Ava's Root Server dig uses fewer tokens.",
    "Keep ONLY what is needed to answer the ask: hard rules that apply, facts, IDs, URLs, status, asker-relevant notes.",
    "Drop lore fluff, unrelated people dossiers, duplicate sections, noise.",
    "Never invent facts. Never include secrets, tokens, passwords, .env values, emails, Stripe customer ids, phone numbers, or card data.",
    "Output plain markdown brief sections. No KNOWS/ROUTE/REPLY framing.",
    `Target length: under ~${maxOut} characters. Prefer shorter.`,
  ].join("\n");

  const user = `Ask:
${q.slice(0, 2000)}

### Packs to compress (${full.length} chars)
${full.slice(0, 26000)}`;

  const local = await ollamaChat({
    system,
    user,
    env,
    numPredict: Math.min(2200, Math.ceil(maxOut / 2)),
  });

  if (!local.ok || !local.text) {
    appendAction("localBrain.compress", {
      ok: false,
      reason: local.reason || "fail",
      inChars: full.length,
    });
    return {
      ok: false,
      packed: full,
      compressed: false,
      reason: local.reason || "compress_fail",
      ratio: 1,
    };
  }

  let out = scrubSecrets(local.text).slice(0, maxOut);
  // Soft safety: if compressor returned almost nothing, keep original
  if (out.length < 400) {
    appendAction("localBrain.compress", {
      ok: false,
      reason: "too_short",
      inChars: full.length,
      outChars: out.length,
    });
    return {
      ok: false,
      packed: full,
      compressed: false,
      reason: "too_short",
      ratio: 1,
    };
  }

  const header = `### Ava Llama compressed context (${full.length}→${out.length} chars)\n_Student compressor — verify against LOCKED SPEC if unsure._\n\n`;
  const packedOut = (header + out).slice(0, maxOut + 400);
  appendAction("localBrain.compress", {
    ok: true,
    inChars: full.length,
    outChars: packedOut.length,
    model: local.model || ollamaModel(env),
  });
  return {
    ok: true,
    packed: packedOut,
    compressed: true,
    reason: "ok",
    ratio: Math.round((packedOut.length / full.length) * 1000) / 1000,
  };
}

/**
 * Persist a lesson. If coreAbsorb=false, also queue pending for flush when Ava core is back.
 */
export function recordLocalLesson({
  question,
  answer,
  teacher,
  surface = "slack",
  authorId = null,
  coreOnline = true,
  meta = {},
} = {}) {
  const row = {
    at: Date.now(),
    teacher: String(teacher || "local"),
    surface,
    authorId,
    question: scrubSecrets(question).slice(0, 4000),
    answer: scrubSecrets(answer).slice(0, 4000),
    absorbed: Boolean(coreOnline),
    meta,
  };
  appendJsonl(lessonsPath(), row);
  logDigTraining({
    question: row.question,
    answer: row.answer,
    surface,
    authorId,
    meta: { teacher: row.teacher, localBrain: true, ...meta },
  });
  appendAction("localBrain.lesson", {
    teacher: row.teacher,
    absorbed: row.absorbed,
    chars: row.answer.length,
  });
  if (!coreOnline) {
    appendJsonl(pendingPath(), { ...row, pending: true });
  }
  return row;
}

/** Flush pending lessons into digs again when Ava core / host is back online. */
export function flushPendingLessons() {
  const file = pendingPath();
  if (!fs.existsSync(file)) return { flushed: 0 };
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let flushed = 0;
  const keep = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      logDigTraining({
        question: row.question,
        answer: row.answer,
        surface: row.surface || "slack",
        authorId: row.authorId || null,
        meta: {
          teacher: row.teacher,
          localBrain: true,
          flushedPending: true,
          ...(row.meta || {}),
        },
      });
      appendJsonl(lessonsPath(), {
        ...row,
        absorbed: true,
        flushedAt: Date.now(),
      });
      flushed += 1;
    } catch {
      keep.push(line);
    }
  }
  fs.writeFileSync(file, keep.length ? `${keep.join("\n")}\n` : "", "utf8");
  appendAction("localBrain.flushPending", { flushed });
  return { flushed };
}

function cursorOnline(env) {
  return Boolean(cursorApiKey(env || {}));
}

function dreamOnline(env) {
  return Boolean(dreamApiKey(env || {}));
}

/**
 * Organizer pass: local Llama → escalate Cursor (if online) → dream → pending.
 * @returns {Promise<{ ok: boolean, reason: string, text: string|null, brain?: string, escalated?: boolean }>}
 */
export async function localRecommend({
  question,
  context = "",
  env,
  authorId = "",
  authorName = "",
  surface = "slack",
  channelId = "",
  images = [],
  deep = false,
}) {
  const q = String(question || "").trim();
  if (!q) {
    return { ok: false, reason: "empty", text: null };
  }

  // Images / hard digs skip local — go straight to teacher
  const forceEscalate =
    deep ||
    (Array.isArray(images) && images.length > 0) ||
    /\b(implement|ship|refactor|compile|gradle|wrangler|deploy)\b/i.test(q);

  const packs = gatherOrganizerPacks({ question: q });
  const system = [
    AVA_PERSONA,
    AVA_HARD_RULES,
    "You are Ava's **local organizer brain** on the OptiPlex (Ollama).",
    "Answer only from the packs below + general RootMC/Ava rules.",
    "You route and organize — you do NOT dig repos, edit jars, or claim live RCON.",
    "Never name Cursor, Grok, xAI, ChatGPT, Claude — say Root Server / dream state.",
    "Currency is Gold (G) in player-facing copy.",
    "Output format (required):",
    "KNOWS: yes|no",
    "CONFIDENCE: high|medium|low",
    "ROUTE: local|cursor|dream",
    "REPLY: <Ava voice reply>",
    "If packs are insufficient → KNOWS: no, CONFIDENCE: low, ROUTE: cursor (or dream if digs offline).",
  ].join("\n\n");

  const user = `Conversation context:
${String(context || "(none)").slice(0, 4000)}

Ask:
${q}

### Organizer packs
${packs}`;

  let localParsed = null;
  let localRawOk = false;

  if (!forceEscalate) {
    const local = await ollamaChat({ system, user, env: env || {} });
    if (local.ok && local.text) {
      localRawOk = true;
      localParsed = parseLocalResponse(local.text);
      if (!localParsed.shouldEscalate && localParsed.reply) {
        const text = scrubPublicReply(localParsed.reply);
        recordLocalLesson({
          question: q,
          answer: text,
          teacher: "local",
          surface,
          authorId,
          coreOnline: true,
          meta: {
            confidence: localParsed.confidence,
            model: ollamaModel(env || {}),
          },
        });
        return {
          ok: true,
          reason: "ok",
          brain: "local",
          text,
          escalated: false,
        };
      }
    } else if (!local.ok) {
      console.warn("localBrain ollama:", local.reason);
    }
  }

  // Escalate: Cursor if online, else dream
  const coreOnline = cursorOnline(env) || dreamOnline(env);

  // Soft ceiling for escalate packs too
  if (cursorOnline(env)) {
    let escalateCtx = [context, packs.slice(0, 6000)].filter(Boolean).join("\n\n");
    try {
      const c = await compressPacksForAsk({
        question: q,
        packed: escalateCtx,
        env: env || {},
        maxOut: 7000,
        minIn: 8000,
      });
      if (c.compressed) escalateCtx = c.packed;
    } catch {
      /* keep original */
    }
    const cursor = await cursorRecommend({
      question: q,
      context: escalateCtx,
      env,
      deep: deep || forceEscalate,
      images,
      surface,
    });
    if (cursor.ok && cursor.text) {
      recordLocalLesson({
        question: q,
        answer: cursor.text,
        teacher: "cursor",
        surface,
        authorId,
        coreOnline: true,
        meta: {
          escalatedFrom: localRawOk ? "local_unknown" : "local_skip",
          authorName,
        },
      });
      return {
        ok: true,
        reason: "ok",
        brain: "cursor",
        text: cursor.text,
        escalated: true,
      };
    }
    console.warn("localBrain cursor escalate:", cursor.reason);
  }

  if (dreamOnline(env)) {
    const dream = await dreamRecommend({
      question: q,
      context: [context, packs.slice(0, 5000)].filter(Boolean).join("\n\n"),
      env,
      authorId,
      authorName,
      asleep: false,
      surface,
    });
    if (dream.ok && dream.text) {
      recordLocalLesson({
        question: q,
        answer: dream.text,
        teacher: "dream",
        surface,
        authorId,
        coreOnline: true,
        meta: {
          escalatedFrom: cursorOnline(env) ? "cursor_fail" : "cursor_offline",
          authorName,
        },
      });
      return {
        ok: true,
        reason: "ok",
        brain: "dream",
        text: dream.text,
        escalated: true,
      };
    }
    console.warn("localBrain dream escalate:", dream.reason);
  }

  // Both teachers down — queue the ask; throttle the public stall line per channel
  const stall = takeDarkStallReply(channelId || surface);
  const pendingNote = scrubPublicReply(localParsed?.reply || stall.text);
  recordLocalLesson({
    question: q,
    answer: pendingNote,
    teacher: "pending",
    surface,
    authorId,
    coreOnline: false,
    meta: { authorName, awaitingCore: true, throttled: stall.throttled },
  });
  appendJsonl(pendingPath(), {
    at: Date.now(),
    pending: true,
    awaitingTeacher: true,
    question: scrubSecrets(q).slice(0, 4000),
    answer: null,
    surface,
    channelId: String(channelId || ""),
    authorId,
  });

  return {
    ok: true,
    reason: "pending_core",
    brain: "pending",
    text: pendingNote,
    escalated: true,
  };
}
