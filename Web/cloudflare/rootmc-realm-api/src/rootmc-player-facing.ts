/** Player-facing copy rules for public RootMC Discord intelligence reports. */

export const ROOTMC_PLAYER_AUDIENCE_RULES =
  "Audience: RootMC players and staff in public Discord — never developers. " +
  "Use plain in-game language. Do not mention plugins, sync, APIs, backends, data pipelines, " +
  "or how metrics are collected. " +
  "Currency is Gold only — write amounts like **47.76 Gold** or **12.5k Gold**. " +
  "Never use $, USD, dollars, or real-world money. " +
  "**Net worth** = a player's or the server's total tracked wealth (balance + items + shops, etc.). " +
  "**Wallet Gold** / **balance** = Gold in their account only. Never call net worth 'Gold total' or 'total Gold'. " +
  "Do not cite server IDs, UUIDs, or internal field names from the JSON. ";

export function sanitizePlayerFacingReport(text: string): string {
  let out = String(text || "");
  out = out.replace(/\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/g, "$1 Gold");
  out = out.replace(/\bUSD\b/gi, "Gold");
  out = out.replace(/\bdollars?\b/gi, "Gold");
  out = out.replace(/\b(?:gold total|total gold)\b/gi, "net worth");
  out = out.replace(/\bsync(?:\s+health|\s+status)?\b/gi, "server activity");
  out = out.replace(/\b(?:rootstat|rootmc|plugin)\b/gi, "");
  out = out.replace(/ {2,}/g, " ");
  return out.trim();
}

export function formatReportGold(value: number): string {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M Gold`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k Gold`;
  if (Number.isInteger(n)) return `${n.toLocaleString()} Gold`;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Gold`;
}

type EconomyTotals = {
  trackedPlayers: number;
  totalNetWorth: number;
  totalBalance: number;
  shopListings: number;
  pricedItems: number;
};

type NetWorthRow = {
  minecraft_username?: string | null;
  total_value?: number | null;
  balance_value?: number | null;
};

export function economyContextForPlayers(economy: EconomyTotals) {
  return {
    currency: "Gold",
    players_with_balances: economy.trackedPlayers,
    gold_in_wallets_total: formatReportGold(economy.totalBalance),
    combined_net_worth: formatReportGold(economy.totalNetWorth),
    active_shop_listings: economy.shopListings,
    items_with_shop_prices: economy.pricedItems,
  };
}

export function netWorthLeaderboardForPlayers(rows: NetWorthRow[], limit = 15) {
  return rows.slice(0, limit).map((row, i) => ({
    rank: i + 1,
    player: String(row.minecraft_username || "Unknown").trim() || "Unknown",
    net_worth: formatReportGold(Number(row.total_value) || 0),
    wallet_gold: formatReportGold(Number(row.balance_value) || 0),
  }));
}

export function discordActivityForPlayers(discord: {
  memberCount: number;
  totalMessages: number;
  topChannels: { name: string; count: number }[];
}) {
  return {
    discord_members: discord.memberCount,
    messages_yesterday: discord.totalMessages,
    busiest_channels: discord.topChannels.slice(0, 6).map((c) => ({
      channel: c.name,
      messages: c.count,
    })),
  };
}
