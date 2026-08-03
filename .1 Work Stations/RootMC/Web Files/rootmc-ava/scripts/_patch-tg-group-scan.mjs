/**
 * One-shot patch: Telegram group URL false-positive + install-ask gate.
 * Safe to re-run (idempotent).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function patchPoller() {
  const p = path.join(src, "telegramPoller.mjs");
  let c = fs.readFileSync(p, "utf8");
  if (c.includes("stripUrlsForNameMatch(t)")) {
    console.log("telegramPoller: already patched");
    return;
  }
  const marker = "return looksLikeTalkingAboutAva(t, null)";
  const i = c.indexOf(marker);
  if (i < 0) throw new Error("telegramPoller: marker missing");
  const start = c.lastIndexOf("if (!t.trim()) return false;", i);
  const end = c.indexOf("\n}", i) + 2;
  const replacement = `if (!t.trim()) return false;
  // Strip URLs first — \\bava\\b matches inside https://ava.rootmc.net (bleed bug).
  const forName = stripUrlsForNameMatch(t);
  return (
    looksLikeTalkingAboutAva(forName, null) || /\\bava(\\s+ivy)?\\b/i.test(forName)
  );
}`;
  c = c.slice(0, start) + replacement + c.slice(end);
  fs.writeFileSync(p, c);
  console.log("telegramPoller: patched addressesAva");
}

function patchTrigger() {
  const p = path.join(src, "recommend.mjs");
  let c = fs.readFileSync(p, "utf8");
  if (c.includes("@(?:ava_ivy_bot|ava)")) {
    console.log("looksLikeAvaTrigger: already patched");
    return;
  }
  const fn = c.indexOf("export function looksLikeAvaTrigger");
  if (fn < 0) throw new Error("looksLikeAvaTrigger missing");
  const insertAt = c.indexOf(
    "  if (/^(hey\\s+|hi\\s+|yo\\s+|ok\\s+|okay\\s+|alright\\s+)?ava",
    fn,
  );
  if (insertAt < 0) throw new Error("trigger insert point missing");
  const before = c.slice(0, insertAt);
  let rest = c.slice(insertAt);
  // Only rewrite the four .test(raw) calls inside this function (until next export)
  const nextExport = rest.indexOf("\nexport function");
  const head = nextExport >= 0 ? rest.slice(0, nextExport) : rest;
  const tail = nextExport >= 0 ? rest.slice(nextExport) : "";
  let h = head;
  for (let n = 0; n < 4; n++) h = h.replace(".test(raw)", ".test(forName)");
  const preamble = `  // Telegram @ava_ivy_bot / @ava
  if (/@(?:ava_ivy_bot|ava)\\b/i.test(raw)) return true;
  const forName = stripUrlsForNameMatch(raw);
`;
  c = before + preamble + h + tail;
  fs.writeFileSync(p, c);
  console.log("looksLikeAvaTrigger: patched");
}

function patchInstallAsk() {
  const p = path.join(src, "pipeline.mjs");
  let c = fs.readFileSync(p, "utf8");
  if (c.includes("First Alex engage in an unapproved group")) {
    console.log("install ask: already patched");
    return;
  }
  const i = c.indexOf("looksLikeInstallBrief(msg.content)");
  if (i < 0) throw new Error("install brief marker missing");
  const blockStart = c.lastIndexOf("} else if (", i);
  const condEnd = c.indexOf(") {", i);
  if (blockStart < 0 || condEnd < 0) throw new Error("install block bounds missing");
  if (!c.slice(blockStart, condEnd).includes("looksLikeInstallBrief")) {
    throw new Error("install block mismatch");
  }
  let depth = 0;
  let j = condEnd + 1;
  let started = false;
  for (; j < c.length; j++) {
    if (c[j] === "{") {
      depth++;
      started = true;
    } else if (c[j] === "}") {
      depth--;
      if (started && depth === 0) {
        j++;
        break;
      }
    }
  }
  const newCond = `} else if (
        !isGroupInstallApproved(channelId) &&
        isAlexTelegramId(msg.author?.id)
      ) {
        // First Alex engage in an unapproved group → always ask install (DM #346).
        const meta = loadGroupMeta(channelId);
        if (!meta.installAskSent) {
          const pending = looksLikeInstallBrief(msg.content)
            ? msg.content
            : null;
          markInstallAskSent(channelId, { pendingBrief: pending });
          touchActivity("tg-group-install-ask");
          await reply(
            channelId,
            "Heard you — I'm listening to tags in this group.\\n\\nIsolation locked: private vault for **this chat only**, nothing bleeds global/Discord/Slack/other groups.\\n\\nBefore I enable install scopes (what I may remember/do here), reply **install go** with the functions you want. Until then I still talk when @tagged.\\n\\n— Ava",
            msg.id,
          );
          return;
        }
      }`;
  c = c.slice(0, blockStart) + newCond + c.slice(j);
  fs.writeFileSync(p, c);
  console.log("install ask: patched");
}

patchPoller();
patchTrigger();
patchInstallAsk();
console.log("done");
