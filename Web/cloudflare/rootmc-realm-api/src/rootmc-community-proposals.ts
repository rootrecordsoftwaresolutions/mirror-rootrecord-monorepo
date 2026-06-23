/**
 * RootMC community governance — linked-player proposals and voting on Discord.
 */

import type { D1Database } from "@cloudflare/workers-types";

import {
  createForumPostThread,
  discordBotFetch,
  sendChannelMessage,
  type DiscordEmbed,
} from "./discord-rootmc-api";
import { resolveOperationsForumChannelId } from "./rootmc-daily-discord-ops";
import { resolveLinkedPlayerByDiscord } from "./discord-rootmc-economy";
import { isSystemReportUser } from "./rootmc-system-report";
import { activateSeasonFromProposal, defaultSeasonLines } from "./rootmc-season-arcs";

export type ProposalEnv = {
  DB: D1Database;
  DISCORD_ROOTMC_BOT_TOKEN?: string;
  DISCORD_ROOTMC_GUILD_ID?: string;
  DISCORD_ROOTMC_GENERAL_CHAT_CHANNEL_ID?: string;
  DISCORD_ROOTMC_OPERATIONS_FORUM_CHANNEL_ID?: string;
  DISCORD_ROOTMC_APPEALS_FORUM_CHANNEL_ID?: string;
};

export type VoteChoice = "for" | "against" | "abstain";

const VOTE_PREFIX = "rootmc_prop:vote:";
const EMBED_BLUE = 0x2d6a4f;
const EMBED_GOLD = 0xc9a227;
const EMBED_RED = 0x8b2635;
/** Minimum linked voters required for a passing result. */
const QUORUM = 5;

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function proposalId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function parseVoteCustomId(customId: string): { proposalId: string; choice: VoteChoice } | null {
  if (!customId.startsWith(VOTE_PREFIX)) return null;
  const rest = customId.slice(VOTE_PREFIX.length);
  const i = rest.lastIndexOf(":");
  if (i <= 0) return null;
  const id = rest.slice(0, i);
  const choice = rest.slice(i + 1) as VoteChoice;
  if (!id || !["for", "against", "abstain"].includes(choice)) return null;
  return { proposalId: id, choice };
}

function voteButtons(proposalId: string, disabled = false) {
  const style = disabled ? 2 : 1;
  return [
    {
      type: 1,
      components: [
        { type: 2, style, label: "For", custom_id: `${VOTE_PREFIX}${proposalId}:for`, disabled },
        { type: 2, style: disabled ? 2 : 4, label: "Against", custom_id: `${VOTE_PREFIX}${proposalId}:against`, disabled },
        { type: 2, style: disabled ? 2 : 2, label: "Abstain", custom_id: `${VOTE_PREFIX}${proposalId}:abstain`, disabled },
      ],
    },
  ];
}

async function tallyVotes(db: D1Database, proposalId: string) {
  const { results } = await db
    .prepare(
      `SELECT vote, COUNT(*) AS c FROM rootmc_community_proposal_votes
       WHERE proposal_id = ? GROUP BY vote`,
    )
    .bind(proposalId)
    .all<{ vote: string; c: number }>();
  let votesFor = 0;
  let votesAgainst = 0;
  let votesAbstain = 0;
  for (const row of results || []) {
    const c = Number(row.c) || 0;
    if (row.vote === "for") votesFor = c;
    else if (row.vote === "against") votesAgainst = c;
    else if (row.vote === "abstain") votesAbstain = c;
  }
  return { votesFor, votesAgainst, votesAbstain, total: votesFor + votesAgainst + votesAbstain };
}

function buildProposalEmbed(
  row: {
    id: string;
    title: string;
    description: string;
    status: string;
    closes_at: string;
    result_summary?: string | null;
    kind?: string | null;
    season_theme?: string | null;
  },
  tallies: { votesFor: number; votesAgainst: number; votesAbstain: number; total: number },
): DiscordEmbed {
  const open = row.status === "open";
  const isSeason = str(row.kind) === "season_arc";
  const lines = [
    isSeason ? `_Season arc vote · theme: **${str(row.season_theme) || row.title}**_` : "",
    row.description.slice(0, 1800),
    "",
    `**For:** ${tallies.votesFor} · **Against:** ${tallies.votesAgainst} · **Abstain:** ${tallies.votesAbstain}`,
    `**Linked voters:** ${tallies.total} (quorum for pass: ${QUORUM})`,
    open ? `_Closes ${row.closes_at.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}_` : `_Status: **${row.status}**_`,
  ].filter(Boolean);
  if (row.result_summary) lines.push("", row.result_summary);
  return {
    title: open ? `Community vote — ${row.title}` : `Closed — ${row.title}`,
    description: lines.join("\n").slice(0, 4096),
    color: open ? EMBED_BLUE : row.status === "passed" ? EMBED_GOLD : EMBED_RED,
    footer: {
      text: `Proposal ${row.id}${isSeason ? " · season arc" : ""} · linked players only`,
    },
  };
}

async function getProposal(db: D1Database, id: string) {
  return db
    .prepare(`SELECT * FROM rootmc_community_proposals WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<Record<string, unknown>>();
}

async function patchProposalMessage(
  token: string,
  channelId: string,
  messageId: string,
  embed: DiscordEmbed,
  proposalId: string,
  disabled: boolean,
): Promise<void> {
  await discordBotFetch(token, `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      embeds: [embed],
      components: voteButtons(proposalId, disabled),
    }),
  });
}

async function requireLinkedVoter(db: D1Database, discordUserId: string) {
  const linked = await resolveLinkedPlayerByDiscord(db, discordUserId);
  if (!linked?.minecraft_uuid) {
    return { ok: false as const, message: "Link Minecraft at https://rootmc.net/verify before voting." };
  }
  return {
    ok: true as const,
    uuid: linked.minecraft_uuid,
    username: str(linked.minecraft_username) || "player",
  };
}

export async function createCommunityProposal(
  env: ProposalEnv,
  params: {
    title: string;
    description: string;
    days: number;
    createdByDiscordId: string;
    kind?: "general" | "season_arc";
    seasonTheme?: string;
    seasonLines?: string[];
  },
): Promise<{ ok: boolean; detail: string; proposalId?: string }> {
  const token = str(env.DISCORD_ROOTMC_BOT_TOKEN);
  const forumId = resolveOperationsForumChannelId(env);
  if (!token || !forumId) {
    return { ok: false, detail: "Bot token or operations forum not configured." };
  }

  const kind = params.kind === "season_arc" ? "season_arc" : "general";
  const seasonTheme = kind === "season_arc" ? str(params.seasonTheme || params.title) : "";
  const seasonLines =
    kind === "season_arc"
      ? (params.seasonLines?.length ? params.seasonLines : defaultSeasonLines(params.title, seasonTheme))
      : [];
  const seasonLinesJson = seasonLines.length ? JSON.stringify(seasonLines) : null;

  const id = proposalId();
  const createdAt = nowIso();
  const closesAt = new Date(Date.now() + Math.max(1, Math.min(30, params.days)) * 24 * 60 * 60 * 1000).toISOString();
  const tallies = { votesFor: 0, votesAgainst: 0, votesAbstain: 0, total: 0 };
  const embed = buildProposalEmbed(
    {
      id,
      title: params.title,
      description: params.description,
      status: "open",
      closes_at: closesAt,
      kind,
      season_theme: seasonTheme || null,
    },
    tallies,
  );

  const thread = await createForumPostThread(token, forumId, params.title.slice(0, 100), {
    content: "_Vote with the buttons below. Linked Minecraft accounts only._",
    embeds: [embed],
  });
  if (!thread?.id) {
    return { ok: false, detail: "Could not create forum post." };
  }

  const msgRes = await discordBotFetch(token, `/channels/${encodeURIComponent(thread.id)}/messages?limit=1`);
  let messageId = "";
  if (msgRes.ok) {
    const msgs = (await msgRes.json()) as Array<{ id?: string }>;
    messageId = str(msgs[0]?.id);
  }
  if (messageId) {
    await patchProposalMessage(token, thread.id, messageId, embed, id, false);
  }

  await env.DB.prepare(
    `INSERT INTO rootmc_community_proposals
       (id, title, description, status, created_by_discord_id, created_at, closes_at, channel_id, message_id,
        kind, season_theme, season_lines_json)
     VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      params.title.slice(0, 200),
      params.description.slice(0, 4000),
      params.createdByDiscordId,
      createdAt,
      closesAt,
      thread.id,
      messageId || null,
      kind,
      seasonTheme || null,
      seasonLinesJson,
    )
    .run();

  const generalId = str(env.DISCORD_ROOTMC_GENERAL_CHAT_CHANNEL_ID);
  if (generalId) {
    const kindNote = kind === "season_arc" ? " _(season arc — announcer lines activate if passed)_" : "";
    await sendChannelMessage(token, generalId, {
      content: `**New community vote:** ${params.title}${kindNote}\nDiscuss and vote in <#${thread.id}> · \`/proposal status id:${id}\``,
    });
  }

  return { ok: true, detail: `Proposal **${id}** opened in <#${thread.id}>.`, proposalId: id };
}

export async function castProposalVote(
  env: ProposalEnv,
  proposalId: string,
  choice: VoteChoice,
  discordUserId: string,
): Promise<{ ok: boolean; detail: string; embed?: DiscordEmbed; channelId?: string; messageId?: string; disabled?: boolean }> {
  const row = await getProposal(env.DB, proposalId);
  if (!row) return { ok: false, detail: "Unknown proposal id." };
  if (str(row.status) !== "open") return { ok: false, detail: "This vote is closed." };
  if (Date.parse(str(row.closes_at)) < Date.now()) {
    return { ok: false, detail: "Voting period ended." };
  }

  const voter = await requireLinkedVoter(env.DB, discordUserId);
  if (!voter.ok) return { ok: false, detail: voter.message };

  await env.DB.prepare(
    `INSERT INTO rootmc_community_proposal_votes
       (proposal_id, discord_user_id, vote, minecraft_uuid, minecraft_username, voted_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(proposal_id, discord_user_id) DO UPDATE SET
       vote = excluded.vote,
       minecraft_uuid = excluded.minecraft_uuid,
       minecraft_username = excluded.minecraft_username,
       voted_at = excluded.voted_at`,
  )
    .bind(proposalId, discordUserId, choice, voter.uuid, voter.username, nowIso())
    .run();

  const tallies = await tallyVotes(env.DB, proposalId);
  const embed = buildProposalEmbed(
    {
      id: proposalId,
      title: str(row.title),
      description: str(row.description),
      status: "open",
      closes_at: str(row.closes_at),
    },
    tallies,
  );

  return {
    ok: true,
    detail: `Recorded **${choice}** as ${voter.username}.`,
    embed,
    channelId: str(row.channel_id) || undefined,
    messageId: str(row.message_id) || undefined,
    disabled: false,
  };
}

export async function closeCommunityProposal(
  env: ProposalEnv,
  proposalId: string,
  forceStatus?: "passed" | "failed" | "cancelled",
): Promise<{ ok: boolean; detail: string }> {
  const token = str(env.DISCORD_ROOTMC_BOT_TOKEN);
  const row = await getProposal(env.DB, proposalId);
  if (!row) return { ok: false, detail: "Unknown proposal id." };
  if (str(row.status) !== "open") return { ok: false, detail: "Already closed." };

  const tallies = await tallyVotes(env.DB, proposalId);
  let status = forceStatus;
  if (!status) {
    if (tallies.total < QUORUM) status = "failed";
    else if (tallies.votesFor > tallies.votesAgainst) status = "passed";
    else status = "failed";
  }

  const summary =
    status === "passed"
      ? `**Result: PASSED** (${tallies.votesFor} for, ${tallies.votesAgainst} against, ${tallies.votesAbstain} abstain)`
      : status === "cancelled"
        ? "**Result: CANCELLED** by staff."
        : `**Result: FAILED** (${tallies.votesFor} for, ${tallies.votesAgainst} against — need ${QUORUM}+ linked voters and majority for)`;

  await env.DB.prepare(
    `UPDATE rootmc_community_proposals
     SET status = ?, closed_at = ?, result_summary = ?
     WHERE id = ?`,
  )
    .bind(status, nowIso(), summary, proposalId)
    .run();

  const embed = buildProposalEmbed(
    {
      id: proposalId,
      title: str(row.title),
      description: str(row.description),
      status,
      closes_at: str(row.closes_at),
      result_summary: summary,
    },
    tallies,
  );

  const channelId = str(row.channel_id);
  const messageId = str(row.message_id);
  if (token && channelId && messageId) {
    await patchProposalMessage(token, channelId, messageId, embed, proposalId, true);
  }

  const generalId = str(env.DISCORD_ROOTMC_GENERAL_CHAT_CHANNEL_ID);
  if (token && generalId) {
    await sendChannelMessage(token, generalId, {
      content: `**Community vote closed — ${str(row.title)}**\n${summary}\n_Proposal \`${proposalId}\`_`,
    });
  }

  if (status === "passed" && str(row.kind) === "season_arc") {
    await activateSeasonFromProposal(env, proposalId);
  }

  return { ok: true, detail: summary };
}

export async function listOpenProposals(db: D1Database): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT id, title, closes_at FROM rootmc_community_proposals
       WHERE status = 'open' ORDER BY closes_at ASC LIMIT 10`,
    )
    .all<{ id: string; title: string; closes_at: string }>();
  if (!results?.length) return "No open community votes.";
  return results
    .map((r) => `• **${r.title}** — \`id:${r.id}\` · closes ${r.closes_at.replace("T", " ").slice(0, 16)} UTC`)
    .join("\n");
}

export async function proposalStatusText(db: D1Database, id: string): Promise<string> {
  const row = await getProposal(db, id);
  if (!row) return "Unknown proposal id.";
  const tallies = await tallyVotes(db, id);
  const embedLines = buildProposalEmbed(
    {
      id: str(row.id),
      title: str(row.title),
      description: str(row.description),
      status: str(row.status),
      closes_at: str(row.closes_at),
      result_summary: str(row.result_summary) || null,
      kind: str(row.kind) || "general",
      season_theme: str(row.season_theme) || null,
    },
    tallies,
  );
  return `${embedLines.title}\n${embedLines.description}`;
}

export async function expireDueProposals(env: ProposalEnv): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM rootmc_community_proposals WHERE status = 'open' AND closes_at <= ?`,
  )
    .bind(nowIso())
    .all<{ id: string }>();
  let closed = 0;
  for (const row of results || []) {
    const res = await closeCommunityProposal(env, row.id);
    if (res.ok) closed++;
  }
  return closed;
}

export function isProposalVoteCustomId(customId: string): boolean {
  return customId.startsWith(VOTE_PREFIX);
}

export async function handleProposalVoteButton(
  env: ProposalEnv,
  customId: string,
  discordUserId: string,
): Promise<Response> {
  const parsed = parseVoteCustomId(customId);
  if (!parsed) {
    return proposalInteraction(4, { content: "Invalid vote button.", flags: 64 });
  }
  const result = await castProposalVote(env, parsed.proposalId, parsed.choice, discordUserId);
  if (!result.ok) {
    return proposalInteraction(4, { content: result.detail, flags: 64 });
  }
  if (result.embed) {
    return proposalInteraction(6, {
      embeds: [result.embed],
      components: voteButtons(parsed.proposalId, false),
    });
  }
  return proposalInteraction(4, { content: result.detail, flags: 64 });
}

function proposalInteraction(
  type: number,
  data: { content?: string; flags?: number; embeds?: unknown[]; components?: unknown[] },
): Response {
  const payload = Object.keys(data).length ? { type, data } : { type };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function handleProposalSlashCommand(
  interaction: Record<string, unknown>,
  env: ProposalEnv,
): Promise<Response> {
  const data = (interaction.data as Record<string, unknown> | undefined) || {};
  const sub = interactionSubcommandName(data);
  const discordUserId = str((interaction.member as Record<string, unknown> | undefined)?.user
    ? ((interaction.member as Record<string, unknown>).user as Record<string, unknown>)?.id
    : (interaction.user as Record<string, unknown> | undefined)?.id);

  if (sub === "create" || sub === "close") {
    if (!isSystemReportUser(discordUserId)) {
      return proposalInteraction(4, { content: "Staff only.", flags: 64 });
    }
  }

  if (sub === "create") {
    const title = interactionSubOptionString(data, "title");
    const description = interactionSubOptionString(data, "description");
    const days = interactionSubOptionInt(data, "days") || 7;
    const kindRaw = interactionSubOptionString(data, "kind").toLowerCase();
    const kind = kindRaw === "season_arc" ? "season_arc" : "general";
    const seasonTheme = interactionSubOptionString(data, "theme");
    const seasonLinesRaw = interactionSubOptionString(data, "lines");
    const seasonLines = seasonLinesRaw
      ? seasonLinesRaw.split("|").map((s) => s.trim()).filter(Boolean)
      : undefined;
    if (!title || !description) {
      return proposalInteraction(4, { content: "Provide **title** and **description**.", flags: 64 });
    }
    const result = await createCommunityProposal(env, {
      title,
      description,
      days,
      createdByDiscordId: discordUserId,
      kind,
      seasonTheme: kind === "season_arc" ? seasonTheme || title : undefined,
      seasonLines,
    });
    return proposalInteraction(4, { content: result.detail, flags: 64 });
  }

  if (sub === "list") {
    const text = await listOpenProposals(env.DB);
    return proposalInteraction(4, { content: text, flags: 64 });
  }

  if (sub === "status") {
    const id = interactionSubOptionString(data, "id");
    if (!id) return proposalInteraction(4, { content: "Provide **id**.", flags: 64 });
    const text = await proposalStatusText(env.DB, id.replace(/^id:/i, ""));
    return proposalInteraction(4, { content: text.slice(0, 2000), flags: 64 });
  }

  if (sub === "close") {
    const id = interactionSubOptionString(data, "id");
    if (!id) return proposalInteraction(4, { content: "Provide **id**.", flags: 64 });
    const result = await closeCommunityProposal(env, id.replace(/^id:/i, ""));
    return proposalInteraction(4, { content: result.detail, flags: 64 });
  }

  return proposalInteraction(4, {
    content: "Use **`/proposal create`**, **`list`**, **`status`**, or staff **`close`**.",
    flags: 64,
  });
}

function interactionSubcommandName(data: Record<string, unknown>): string {
  const opts = (data.options as Array<Record<string, unknown>> | undefined) || [];
  const sub = opts.find((o) => Number(o.type) === 1);
  return String(sub?.name ?? "").trim().toLowerCase();
}

function interactionSubOptionString(data: Record<string, unknown>, name: string): string {
  const opts = (data.options as Array<Record<string, unknown>> | undefined) || [];
  const sub = opts.find((o) => Number(o.type) === 1);
  const subOpts = (sub?.options as Array<Record<string, unknown>> | undefined) || [];
  const hit = subOpts.find((o) => String(o.name) === name);
  return String(hit?.value ?? "").trim();
}

function interactionSubOptionInt(data: Record<string, unknown>, name: string): number {
  const raw = interactionSubOptionString(data, name);
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}
