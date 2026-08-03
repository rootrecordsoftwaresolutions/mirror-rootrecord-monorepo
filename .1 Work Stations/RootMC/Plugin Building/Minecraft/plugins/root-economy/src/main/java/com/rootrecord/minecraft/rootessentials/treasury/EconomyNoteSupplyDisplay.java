package com.rootrecord.minecraft.rootessentials.treasury;

import com.rootrecord.minecraft.common.ChatUi;
import com.rootrecord.minecraft.rooteconomy.RootEconomyPlugin;
import com.rootrecord.minecraft.rootessentials.web.RootMcEconomyWeb;
import org.bukkit.command.CommandSender;

/** Essentials-only Gold Notes vs /mint â€” catalog lines, not a stats essay. */
public final class EconomyNoteSupplyDisplay {

    private EconomyNoteSupplyDisplay() {}

    public static void sendHeadline(
            RootEconomyPlugin plugin,
            CommandSender sender,
            EconomyBaseline.NoteSupplySnapshot supply,
            String title,
            boolean includeLinks) {
        sendHeadline(plugin, sender, supply, null, title, includeLinks);
    }

    /**
     * @param ledgerReserveG opening + post-reset ledger net (can be negative; matches rootmc.net/reserve).
     *                       When null, falls back to floored note-supply reserve vault.
     */
    public static void sendHeadline(
            RootEconomyPlugin plugin,
            CommandSender sender,
            EconomyBaseline.NoteSupplySnapshot supply,
            Double ledgerReserveG,
            String title,
            boolean includeLinks) {
        ChatUi.banner(sender, stripLegacy(title));

        String cur = plugin.currency();
        ChatUi.gold(sender, "Notes", money(plugin, supply.totalNotesG()), cur);
        ChatUi.gold(sender, "Minted", money(plugin, supply.goldMinedG()), cur);

        if (supply.overIssued()) {
            ChatUi.entry(sender, "Backing", "+" + money(plugin, supply.overIssueG()) + " " + cur, "alert");
        } else if (supply.backingPct() != null) {
            ChatUi.entry(sender, "Backing", pct(supply.backingPct()) + "%", "ok");
        } else {
            ChatUi.entry(sender, "Backing", "fully backed", "ok");
        }

        sendTaxLine(plugin, sender, plugin.treasury());
        sendTownTaxLine(plugin, sender);

        double reserveLine = ledgerReserveG != null ? ledgerReserveG : supply.reserveNotesG();
        ChatUi.gold(sender, "Reserve", money(plugin, reserveLine), cur);

        if (sender instanceof org.bukkit.entity.Player player) {
            sendPlayerBondLines(plugin, player);
        }

        if (includeLinks) {
            ChatUi.links(
                    sender,
                    "Economy", RootMcEconomyWeb.economy(),
                    "Reserve", RootMcEconomyWeb.reserve(),
                    "Constitution", RootMcEconomyWeb.constitution());
        }
    }

    /** Peg, backing, total gold, and live mint/transaction tax â€” shared by /mint and /reserve. */
    public static void sendMintCatalog(
            RootEconomyPlugin plugin,
            CommandSender sender,
            EconomyBaseline.NoteSupplySnapshot supply) {
        if (supply != null) {
            sendBackingLine(sender, supply);
            ChatUi.gold(sender, "Gold", money(plugin, supply.goldMinedG()), plugin.currency());
        }
        ChatUi.row(sender, "Peg", "nugget 1/9 | ingot 1 | block 9 | raw 1");
        sendTaxLine(plugin, sender, plugin.treasury());
        sendTownTaxLine(plugin, sender);
    }

    /** @deprecated Prefer {@link #sendMintCatalog(RootEconomyPlugin, CommandSender, EconomyBaseline.NoteSupplySnapshot)}. */
    public static void sendMintCatalog(RootEconomyPlugin plugin, CommandSender sender) {
        sendMintCatalog(plugin, sender, null);
    }

    /** Player Total bonds / Town bonds â€” shared by /economy, /reserve. */
    public static void sendPlayerBondLines(RootEconomyPlugin plugin, org.bukkit.entity.Player player) {
        double totalBonds = 0;
        var feature = plugin.bondsFeature();
        if (feature != null) {
            try {
                var summary = feature.bondHeartbeatSummary(player.getUniqueId());
                if (summary != null) {
                    totalBonds = summary.principalG();
                }
            } catch (Exception ignored) {
                // leave 0
            }
        }
        ChatUi.gold(player, "Total bonds", money(plugin, totalBonds), "G");

        String townName = com.rootrecord.minecraft.rootessentials.towny.TownyPlayerAccess.townName(player)
                .orElse(null);
        if (townName == null || townName.isBlank()) {
            return;
        }
        double townBonds = com.rootrecord.minecraft.rootessentials.towny.TownyEconomyAccounts
                .townBankByName(townName)
                .map(account -> plugin.balance(account.uuid(), account.username()))
                .orElse(0.0);
        ChatUi.gold(player, "Town bonds", money(plugin, townBonds), "G");
    }

    public static void sendTownTaxLine(RootEconomyPlugin plugin, CommandSender sender) {
        double ratePct = 0.01;
        var upkeep = plugin.upkeepFeature();
        if (upkeep != null && upkeep.config() != null && upkeep.config().townDailyTaxEnabled()) {
            ratePct = upkeep.config().townDailyTaxRatePercent();
        } else if (upkeep != null && upkeep.config() != null && !upkeep.config().townDailyTaxEnabled()) {
            return;
        }
        String rate = String.format(java.util.Locale.US, "%.2f", ratePct);
        ChatUi.row(sender, "Town tax", rate + "% of town bank / MC day -> Reserve");
    }

    public static void sendBackingLine(CommandSender sender, EconomyBaseline.NoteSupplySnapshot supply) {
        if (supply == null) {
            return;
        }
        if (supply.backingPct() != null) {
            String body = pct(supply.backingPct()) + "%";
            if (supply.overIssued()) {
                ChatUi.entry(sender, "Backing", body, "alert");
            } else {
                ChatUi.entry(sender, "Backing", body, "ok");
            }
        } else {
            ChatUi.entry(sender, "Backing", "fully backed", "ok");
        }
    }

    public static void sendTaxLine(RootEconomyPlugin plugin, CommandSender sender, TreasuryManager treasury) {
        if (treasury == null || !treasury.transactionTaxEnabled()) {
            return;
        }
        double effective = treasury.effectiveTransactionTaxRate();
        if (treasury.dynamicTaxEnabled()) {
            if (effective <= 0.000001) {
                ChatUi.entry(sender, "Tax", "0% -> Reserve", "ok");
            } else {
                ChatUi.entry(sender, "Tax", pct(effective * 100.0) + "% -> Reserve");
            }
            ChatUi.row(sender, "Tiers", "0% >=1k | 1% <1k | 2% <0 | 3% <-1k | 4% <-2k | 5% <-4k | 10% <-10k");
        } else {
            ChatUi.entry(sender, "Tax", pct(treasury.transactionTaxRate() * 100.0) + "% -> Reserve");
        }
    }

    private static String money(RootEconomyPlugin plugin, double value) {
        return plugin.money(value);
    }

    private static String pct(double value) {
        return String.format(java.util.Locale.US, "%.1f", value);
    }

    private static String stripLegacy(String title) {
        if (title == null || title.isBlank()) {
            return "Economy";
        }
        return title.replaceAll("(?i)&[0-9a-fk-or]", "").trim();
    }
}
