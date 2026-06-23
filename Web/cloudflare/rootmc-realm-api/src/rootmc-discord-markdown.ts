/** Split long markdown for Discord message content (2000 char limit). */

import { sendChannelMessage } from "./discord-rootmc-api";

const DISCORD_CONTENT_MAX = 1900;

export function splitDiscordMarkdown(text: string, max = DISCORD_CONTENT_MAX): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > 0) {
    if (rest.length <= max) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.45) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.45) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  return chunks.filter(Boolean);
}

export async function sendChannelMarkdownReport(
  token: string,
  channelId: string,
  parts: string[],
): Promise<string | null> {
  let firstId: string | null = null;
  for (const part of parts) {
    const id = await sendChannelMessage(token, channelId, { content: part });
    if (!firstId && id) firstId = id;
    if (!id) return firstId;
  }
  return firstId;
}

export function formatBriefMarkdown(params: {
  title: string;
  dayKey: string;
  categoryLabel: string;
  summary?: string;
  report: string;
  footer?: string;
}): string {
  const lines = [
    `## ${params.title}`,
    `_${params.dayKey} HST_`,
    "",
  ];
  if (params.summary) {
    lines.push(`**${params.summary}**`, "");
  }
  lines.push(params.report.trim());
  if (params.footer) {
    lines.push("", `_${params.footer}_`);
  }
  return lines.join("\n");
}

export const ROOTMC_NO_CHANGE_REPORT_TEXT = "No new information to generate a new report.";
