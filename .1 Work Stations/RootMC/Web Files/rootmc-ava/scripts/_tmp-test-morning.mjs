#!/usr/bin/env node
import { isOpsPowerStatusAsk, buildOpsPowerStatusReply } from "../src/opsPowerStatus.mjs";
import { summarizeMorningSolar } from "../src/ecoflow.mjs";

const q =
  "Very nice, and the average solar intake this morning? It's cloudy and rainy in Hawai'i";
console.log("detect", isOpsPowerStatusAsk(q));
console.log("morning", summarizeMorningSolar({ tzOffsetHours: -10 }));
const reply = await buildOpsPowerStatusReply({
  authorId: "1497037418979786823",
  question: q,
});
console.log(reply);
