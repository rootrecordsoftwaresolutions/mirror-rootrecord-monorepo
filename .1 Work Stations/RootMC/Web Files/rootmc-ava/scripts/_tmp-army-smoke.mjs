import {
  classifyArmyDept,
  gatherArmyBrief,
  ensureArmyFoundation,
  assignArmyJob,
} from "../src/avasArmy.mjs";

ensureArmyFoundation();
console.log("route solar", classifyArmyDept("host-site solar telemetry"));
console.log("route army", classifyArmyDept("ava's army departments"));
assignArmyJob({ text: "Make it a function", source: "discord", dept: "command" });
console.log(gatherArmyBrief({ question: "show ava army" }).brief.slice(0, 400));
