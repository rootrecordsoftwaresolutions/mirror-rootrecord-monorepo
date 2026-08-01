import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { storePaths } from "./store.mjs";

/**
 * Persist conversation turns (JSONL + SQLite) for training + audit.
 */

function convDir() {
  const dir = path.join(storePaths().dir, "conversations");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function turnsPath() {
  return path.join(convDir(), "turns.jsonl");
}

function indexPath() {
  return path.join(convDir(), "index.json");
}

function sqlitePath() {
  return path.join(convDir(), "turns.sqlite");
}

function readIndex() {
  try {
    if (!fs.existsSync(indexPath())) return { turns: 0, byUser: {}, updatedAt: 0 };
    return JSON.parse(fs.readFileSync(indexPath(), "utf8"));
  } catch {
    return { turns: 0, byUser: {}, updatedAt: 0 };
  }
}

function writeIndex(idx) {
  fs.writeFileSync(indexPath(), JSON.stringify(idx, null, 2), "utf8");
}

let db = null;

function getDb() {
  if (db) return db;
  db = new DatabaseSync(sqlitePath());
  db.exec(`
    CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      channel_id TEXT,
      message_id TEXT,
      author_id TEXT,
      author_name TEXT,
      question TEXT,
      answer TEXT,
      intent TEXT,
      job_id TEXT,
      quality TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_turns_author ON turns(author_id);
    CREATE INDEX IF NOT EXISTS idx_turns_at ON turns(at);
  `);
  return db;
}

/**
 * @param {{ channelId, messageId, authorId, authorName, question, answer, intent?, jobId?, quality? }} turn
 */
export function persistTurn(turn) {
  const row = {
    at: Date.now(),
    channelId: turn.channelId || null,
    messageId: turn.messageId || null,
    authorId: turn.authorId || null,
    authorName: turn.authorName || null,
    question: String(turn.question || "").slice(0, 4000),
    answer: String(turn.answer || "").slice(0, 4000),
    intent: turn.intent || null,
    jobId: turn.jobId || null,
    quality: turn.quality || null,
  };

  fs.appendFileSync(turnsPath(), JSON.stringify(row) + "\n", "utf8");

  try {
    getDb()
      .prepare(
        `INSERT INTO turns (at, channel_id, message_id, author_id, author_name, question, answer, intent, job_id, quality)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.at,
        row.channelId,
        row.messageId,
        row.authorId,
        row.authorName,
        row.question,
        row.answer,
        row.intent,
        row.jobId,
        row.quality,
      );
  } catch (err) {
    console.warn("sqlite turn:", err.message);
  }

  const idx = readIndex();
  idx.turns = (idx.turns || 0) + 1;
  idx.updatedAt = Date.now();
  if (row.authorId) {
    idx.byUser[row.authorId] = (idx.byUser[row.authorId] || 0) + 1;
  }
  writeIndex(idx);
  return row;
}

export function conversationStats() {
  const idx = readIndex();
  let sqliteTurns = null;
  try {
    const r = getDb().prepare("SELECT COUNT(*) AS n FROM turns").get();
    sqliteTurns = r?.n ?? null;
  } catch {
    sqliteTurns = null;
  }
  return { ...idx, sqliteTurns };
}
