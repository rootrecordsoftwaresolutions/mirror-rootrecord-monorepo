#!/usr/bin/env node
/**
 * Post as Ava only — Discord bot or Slack bot token from RootMC .env.
 * Never use Cursor Slack MCP for Ava (that posts as the human workspace user).
 *
 * Usage:
 *   node scripts/post-as-ava.mjs discord <channelId> [refMessageId] < text.txt
 *   node scripts/post-as-ava.mjs slack <channelId> [thread_ts] < text.txt
 *   node scripts/post-as-ava.mjs telegram <chatId> [replyToMessageId] --text "hello"
 *   node scripts/post-as-ava.mjs slack C0BMCPMDDQR 1785636170.911489 --text "hello"
 */
import fs from "node:fs";
import { postAvaDiscord, postAvaSlack, postAvaTelegram } from "../src/avaPost.mjs";

const args = process.argv.slice(2);
const surface = String(args[0] || "").toLowerCase();
const channelId = args[1];
let ref = null;
let textFlag = null;
const rest = [];
for (let i = 2; i < args.length; i++) {
  if (args[i] === "--text") {
    textFlag = args[++i] || "";
  } else {
    rest.push(args[i]);
  }
}
if (rest[0] && !String(rest[0]).startsWith("--")) ref = rest[0];

if (!surface || !channelId || !["discord", "slack", "telegram"].includes(surface)) {
  console.error(
    "Usage: node scripts/post-as-ava.mjs <discord|slack|telegram> <channelId> [ref/thread_ts] [--text '...']",
  );
  process.exit(1);
}

let content = textFlag;
if (content == null) {
  content = fs.readFileSync(0, "utf8");
}
content = String(content || "").trim();
if (!content) {
  console.error("empty content");
  process.exit(1);
}

if (surface === "discord") {
  const msg = await postAvaDiscord({
    channelId,
    content,
    refId: ref,
    kind: "operator_directed",
    source: "post-as-ava-cli",
  });
  console.log("ok discord", msg?.id || msg);
} else if (surface === "telegram") {
  const msg = await postAvaTelegram({
    chatId: channelId,
    content,
    replyToMessageId: ref,
    kind: "operator_directed",
    source: "post-as-ava-cli",
  });
  console.log("ok telegram", msg?.id || msg);
} else {
  const data = await postAvaSlack({
    channelId,
    content,
    threadTs: ref,
    kind: "operator_directed",
    source: "post-as-ava-cli",
  });
  console.log("ok slack", data?.ts, "channel", channelId);
}
