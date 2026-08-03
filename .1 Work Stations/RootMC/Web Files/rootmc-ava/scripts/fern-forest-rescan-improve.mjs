#!/usr/bin/env node
/**
 * One-shot: Fern Forest rescan improve — profile + notes + inbound backfill.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ensureFernForestProfile,
  appendGardeningNote,
  FERN_FOREST_CHAT_ID,
} from "../src/fernForestHawaii.mjs";
import { storePaths } from "../src/store.mjs";

const profile = ensureFernForestProfile();
console.log("profile updated", profile.id, profile.updatedAt);

const notes = [
  {
    kind: "crew",
    by: "Crazychickenlady12",
    tags: ["seeds", "wet", "urgent"],
    text: "Crew (msg 15289): planting seeds that got wet somehow before dinner — wet-seed rescue is a live topic here.",
  },
  {
    kind: "tip",
    by: "ava",
    tags: ["seeds", "wet", "hawaii", "uncertain"],
    text: "Wet seeds (general): if packets/seeds got damp, plant soon rather than letting them mold in the bag. Optional: blot gently, air-dry briefly in shade, then sow. Hawaiʻi humidity speeds mold — uncertain tip, adjust for seed type.",
  },
  {
    kind: "tip",
    by: "ava",
    tags: ["ferns", "hawaii", "shade"],
    text: "Hawaiʻi ferns: many prefer bright shade / dappled light, steady moisture, and airy organic media. Avoid baking midday sun on thin fronds. Hapuu-style tree ferns like cool roots + mulch (microclimate varies by island/elevation — label local).",
  },
  {
    kind: "tip",
    by: "ava",
    tags: ["tropicals", "water", "rain"],
    text: "Tropicals / beds: deep morning water when rain skips; raised beds drain faster after windward downpours. Check soil 1–2 in down — wet surface can hide dry root zone in heat.",
  },
  {
    kind: "tip",
    by: "ava",
    tags: ["pests", "slugs", "hawaii", "ipm"],
    text: "Common wet-HI pests: slugs/snails after rain. Gentle IPM: handpick at dusk, beer traps, copper tape on containers, tidy decaying mulch edges. Avoid blanket pesticides near edibles unless crew agrees.",
  },
  {
    kind: "tip",
    by: "ava",
    tags: ["seasons", "hawaii"],
    text: "Seasons: many Hawaiʻi gardens track wet/dry + trade-wind patterns more than temperate spring/fall. Windward = heavier rain risk for rot; leeward = drought stress. Match plant choice to microclimate (uncertain without exact elevation).",
  },
  {
    kind: "ops",
    by: "alex",
    tags: ["digs", "queue"],
    text: "Alex DM: Fern Forest can keep 3 dig-queue lines; catch up on Telegram group chat fully.",
  },
  {
    kind: "ops",
    by: "alex",
    tags: ["personality", "groups"],
    text: "Alex (15285): be self-determined per group — look what the group is about, be resourceful, invent/find topics if none. No tag required (15282–83). Minecraft lore OK (15280–81). Catch up on chat (15290).",
  },
];
for (const n of notes) appendGardeningNote(FERN_FOREST_CHAT_ID, n);
console.log("appended", notes.length, "gardening notes");

const vault = path.join(storePaths().dir, "telegram", "groups", FERN_FOREST_CHAT_ID);
const inbound = path.join(vault, "inbound.jsonl");
const memory = path.join(vault, "memory.jsonl");
const now = Date.now();
const missed = [
  { id: "15282", from: "6644482344", name: "WildEcho94", text: "Should have just said Ava" },
  { id: "15283", from: "6644482344", name: "WildEcho94", text: "No need to tag" },
  {
    id: "15285",
    from: "6644482344",
    name: "WildEcho94",
    text: "Remember to be self determined for each group, all groups/server/whatever are all different stuff yeah... So be sure to always think and look what a group is about and then find ways to be resourceful, and topics if you can't find any",
  },
  { id: "15286", from: "6644482344", name: "WildEcho94", text: "Ava" },
  { id: "15288", from: "6644482344", name: "WildEcho94", text: "She's slow but it's self hosted" },
  {
    id: "15289",
    from: "6574408926",
    name: "Crazychickenlady12",
    text: "okay i have to plant some seeds really quick they got wet somehow then ill start on dinner",
  },
  { id: "15290", from: "6644482344", name: "WildEcho94", text: "Ok, Ava can catch up on the chat" },
];
const existingIn = fs.existsSync(inbound) ? fs.readFileSync(inbound, "utf8") : "";
for (const m of missed) {
  if (existingIn.includes(m.text.slice(0, 48))) continue;
  fs.appendFileSync(
    inbound,
    `${JSON.stringify({ at: now, event: "group_update", fromId: m.from, preview: m.text, messageId: m.id })}\n`,
  );
  if (/ava/i.test(m.text) || m.id === "15285" || m.id === "15290") {
    fs.appendFileSync(
      inbound,
      `${JSON.stringify({ at: now, event: "addressed", fromId: m.from, preview: m.text, messageId: m.id })}\n`,
    );
  }
  fs.appendFileSync(
    memory,
    `${JSON.stringify({ at: now, authorId: m.from, authorName: m.name, content: m.text, messageId: m.id })}\n`,
  );
}
console.log("vault inbound/memory backfilled");
