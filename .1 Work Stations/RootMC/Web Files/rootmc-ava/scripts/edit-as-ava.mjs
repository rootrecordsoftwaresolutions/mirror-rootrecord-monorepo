#!/usr/bin/env node
/**
 * Edit one of Ava's own Discord messages.
 * Usage: node scripts/edit-as-ava.mjs <channelId> <messageId> --text "..."
 *    or: node scripts/edit-as-ava.mjs <channelId> <messageId> < text.txt
 */
import fs from "node:fs";
import { editAvaDiscord } from "../src/avaPost.mjs";

const args = process.argv.slice(2);
const channelId = args[0];
const messageId = args[1];
let textFlag = null;
for (let i = 2; i < args.length; i++) {
  if (args[i] === "--text") textFlag = args[++i] || "";
}

if (!channelId || !messageId) {
  console.error(
    "Usage: node scripts/edit-as-ava.mjs <channelId> <messageId> [--text '...']",
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

const msg = await editAvaDiscord({
  channelId,
  messageId,
  content,
  kind: "operator_edit",
  source: "edit-as-ava-cli",
});
console.log("ok edit", msg?.id || messageId);
