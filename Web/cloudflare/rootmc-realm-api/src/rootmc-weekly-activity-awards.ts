/**
 * Sunday 08:00 HST — combined Discord + in-game weekly awards (roles reset each week).
 */

import type { D1Database } from "@cloudflare/workers-types";

import {
  addGuildMemberRole,
  discordBotFetch,
  removeGuildMemberRole,
} from "./discord-rootmc-api";
import {
  weeklyActiveParticipantWinners,
  formatParticipatorScoreLine,
  type ActiveParticipantWinner,
  type RootMcActiveParticipantEnv,
} from "./rootmc-active-participant";
import { hstWeekBoundsMs, previousHstWeekKey } from "./rootmc-hst-week";
import { resolveServerId } from "./rootmc-daily-report";
import {
  capturePlaytimeWeekSnapshots,
  seedPlaytimeBaselineIfNeeded,
  weeklyTopActivePlayerWinners,
  grantWeeklyProMembership,
  TOP_ACTIVE_N,
  type TopActivePlayerWinner,
  MIN_WEEKLY_SECONDS,
} from "./rootmc-top-active-player";

export type RootMcWeeklyActivityAwardsEnv = RootMcActiveParticipantEnv & {
  DISCORD_ROOTMC_TOP_ACTIVE_PLAYER_ROLE_ID?: string;
};

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function mention(userId: string): string {
  return `<@${userId}>`;
}

async function weeklyActivityAwardsPosted(db: D1Database, weekKey: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM rootmc_weekly_activity_awards WHERE week_key = ? LIMIT 1`)
    .bind(weekKey)
    .first();
  return Boolean(row);
}

async function revokeRoleIdsFromTable(
  db: D1Database,
  token: string,
  guildId: string,
  roleId: string,
  table: "rootmc_active_participant_awards" | "rootmc_top_active_player_awards",
  previousWeekKey: string,
): Promise<void> {
  const rows = await db
    .prepare(`SELECT discord_user_id FROM ${table} WHERE week_key = ? AND role_granted = 1`)
    .bind(previousWeekKey)
    .all<{ discord_user_id: string }>();

  for (const row of rows.results || []) {
    const uid = str(row.discord_user_id);
    if (!uid) continue;
    await removeGuildMemberRole(token, guildId, uid, roleId);
  }
}

function buildCombinedPost(
  weekKey: string,
  discordWinners: ActiveParticipantWinner[],
  playtimeWinners: TopActivePlayerWinner[],
  participantRoleId: string,
  playtimeRoleId: string,
  playtimeBaselineSeeded: boolean,
  proGrantedCount: number,
): string {
  const { startMs, endMs } = hstWeekBoundsMs(weekKey);
  const startLabel = new Date(startMs).toLocaleDateString("en-US", {
    timeZone: "Pacific/Honolulu",
    month: "short",
    day: "numeric",
  });
  const endLabel = new Date(endMs).toLocaleDateString("en-US", {
    timeZone: "Pacific/Honolulu",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const lines = [
    `# 🏅 Weekly Activity Awards — Week of ${weekKey}`,
    "",
    `**Period:** ${startLabel} – ${endLabel} (Mon–Sun, **HST**). Roles **reset every Sunday 08:00 HST**.`,
    "",
    "## 💬 Top Participator (Discord)",
    "",
    "**How we measured it**",
    "• **Message blocks** — 1 pt each (consecutive posts until someone else speaks)",
    "• **Votes** — 5 pts each (`/proposal`)",
    "• **Reactions** — 1 pt each",
    "• Root-AI reviews saved activity and excludes spam before final ranks",
    "• Minimum **5 weighted points**; **top 5** earn the role",
    "",
  ];

  if (discordWinners.length === 0) {
    lines.push("_No qualifying Discord activity this week._");
  } else {
    discordWinners.forEach((w, i) => {
      lines.push(
        `${i + 1}. ${mention(w.discord_user_id)} (**${w.display_name}**) — ${formatParticipatorScoreLine(w)}`,
      );
    });
    lines.push("", `Role: <@&${participantRoleId}>`);
  }

  lines.push("", "## ⛏ Top Active Players (In-game)", "", "**How we measured it**");
  lines.push(
    "• **Playtime this week** — delta from RootStat sync (end minus prior Sunday snapshot)",
    `• Linked Minecraft + Discord; minimum **${Math.floor(MIN_WEEKLY_SECONDS / 3600)} hour** this week`,
    `• **Top ${TOP_ACTIVE_N}** earn the role + **one-week Pro membership** on the RootMC app`,
  );

  if (playtimeBaselineSeeded) {
    lines.push("", "_First playtime baseline captured — in-game awards start next week._");
  } else if (playtimeWinners.length === 0) {
    lines.push("", "_No qualifying linked players met the playtime threshold this week._");
  } else {
    playtimeWinners.forEach((w) => {
      lines.push(
        `${w.rank}. ${mention(w.discord_user_id)} (**${w.minecraft_username}**) — **${w.weekly_playtime_label}** in-game`,
      );
    });
    lines.push("", `Role: <@&${playtimeRoleId}>`);
    if (proGrantedCount > 0) {
      lines.push(`Pro membership extended for **${proGrantedCount}** linked account(s) (7 days).`);
    }
  }

  lines.push(
    "",
    "_Discord: message blocks + votes + reactions in D1, judged by Root-AI. In-game: playtime snapshots._",
  );

  return lines.join("\n");
}

export async function runRootMcWeeklyActivityAwards(
  env: RootMcWeeklyActivityAwardsEnv,
  weekKey: string,
): Promise<{
  ok: boolean;
  detail?: string;
  messageId?: string;
  discordWinners?: ActiveParticipantWinner[];
  playtimeWinners?: TopActivePlayerWinner[];
}> {
  const token = str(env.DISCORD_ROOTMC_BOT_TOKEN);
  const guildId = str(env.DISCORD_ROOTMC_GUILD_ID);
  const channelId = str(env.DISCORD_ROOTMC_GENERAL_CHAT_CHANNEL_ID);
  const participantRoleId = str(env.DISCORD_ROOTMC_ACTIVE_PARTICIPANT_ROLE_ID);
  const playtimeRoleId = str(env.DISCORD_ROOTMC_TOP_ACTIVE_PLAYER_ROLE_ID);

  if (!token || !guildId || !channelId || !participantRoleId || !playtimeRoleId) {
    return { ok: false, detail: "missing bot, guild, general-chat, or reward role ids" };
  }

  if (await weeklyActivityAwardsPosted(env.DB, weekKey)) {
    return { ok: true, detail: "already posted" };
  }

  const serverId = await resolveServerId(env.DB);
  const prevWeek = previousHstWeekKey(weekKey);

  const playtimeBaselineSeeded = await seedPlaytimeBaselineIfNeeded(env.DB, serverId, weekKey);
  await capturePlaytimeWeekSnapshots(env.DB, serverId, weekKey);

  const discordWinners = await weeklyActiveParticipantWinners(env.DB, env, weekKey);
  const playtimeWinners = playtimeBaselineSeeded
    ? []
    : await weeklyTopActivePlayerWinners(env.DB, serverId, weekKey);

  if (discordWinners.length === 0 && playtimeWinners.length === 0 && !playtimeBaselineSeeded) {
    return { ok: false, detail: "no qualifying winners this week" };
  }

  await revokeRoleIdsFromTable(
    env.DB,
    token,
    guildId,
    participantRoleId,
    "rootmc_active_participant_awards",
    prevWeek,
  );
  await revokeRoleIdsFromTable(
    env.DB,
    token,
    guildId,
    playtimeRoleId,
    "rootmc_top_active_player_awards",
    prevWeek,
  );

  const proGrantedCount =
    playtimeWinners.length > 0 ? await grantWeeklyProMembership(env.DB, playtimeWinners) : 0;

  const content = buildCombinedPost(
    weekKey,
    discordWinners,
    playtimeWinners,
    participantRoleId,
    playtimeRoleId,
    playtimeBaselineSeeded,
    proGrantedCount,
  );

  const postRes = await discordBotFetch(token, `/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: content.slice(0, 2000) }),
  });
  if (!postRes.ok) {
    return { ok: false, detail: `discord post failed ${postRes.status}` };
  }
  const posted = (await postRes.json().catch(() => ({}))) as { id?: string };
  const messageId = str(posted.id) || null;
  const ts = nowIso();

  for (let i = 0; i < discordWinners.length; i++) {
    const w = discordWinners[i];
    await addGuildMemberRole(token, guildId, w.discord_user_id, participantRoleId);
    await env.DB.prepare(
      `INSERT INTO rootmc_active_participant_awards
         (week_key, discord_user_id, rank, message_count, vote_count, reaction_count, activity_score,
          username, role_granted, posted_at, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
      .bind(
        weekKey,
        w.discord_user_id,
        i + 1,
        w.message_count,
        w.vote_count,
        w.reaction_count,
        w.activity_score,
        w.display_name,
        ts,
        messageId,
      )
      .run();
  }

  for (const w of playtimeWinners) {
    await addGuildMemberRole(token, guildId, w.discord_user_id, playtimeRoleId);
    await env.DB.prepare(
      `INSERT INTO rootmc_top_active_player_awards
         (week_key, minecraft_uuid, discord_user_id, weekly_playtime_seconds, minecraft_username,
          discord_display_name, rank, pro_granted, role_granted, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
      .bind(
        weekKey,
        w.minecraft_uuid,
        w.discord_user_id,
        w.weekly_playtime_seconds,
        w.minecraft_username,
        w.discord_display_name,
        w.rank,
        w.pro_granted ? 1 : 0,
        ts,
      )
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO rootmc_weekly_activity_awards (week_key, posted_at, message_id) VALUES (?, ?, ?)`,
  )
    .bind(weekKey, ts, messageId)
    .run();

  return {
    ok: true,
    detail: playtimeBaselineSeeded ? "posted (playtime baseline seeded)" : "posted",
    messageId: messageId || undefined,
    discordWinners,
    playtimeWinners,
  };
}
