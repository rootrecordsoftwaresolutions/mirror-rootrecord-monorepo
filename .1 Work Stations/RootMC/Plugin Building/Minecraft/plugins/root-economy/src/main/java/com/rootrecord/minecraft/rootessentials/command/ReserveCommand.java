package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.common.ChatUi;
import com.rootrecord.minecraft.rooteconomy.RootEconomyPlugin;
import com.rootrecord.minecraft.rootessentials.treasury.EconomyNoteSupplyDisplay;
import com.rootrecord.minecraft.rootessentials.treasury.ReserveStatsService;
import com.rootrecord.minecraft.rootessentials.util.HstTime;
import com.rootrecord.minecraft.rootessentials.web.RootMcEconomyWeb;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.util.UUID;

public final class ReserveCommand implements CommandExecutor {

    private final RootEconomyPlugin plugin;

    public ReserveCommand(RootEconomyPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        UUID playerUuid = sender instanceof Player p ? p.getUniqueId() : null;
        try {
            ReserveStatsService.ReserveSnapshot snap = plugin.reserveSnapshot(playerUuid);
            sendReserve(sender, snap);
            return true;
        } catch (Exception ex) {
            sender.sendMessage(plugin.colorize("&cReserve stats failed: &f" + ex.getMessage()));
            return true;
        }
    }

    private void sendReserve(CommandSender sender, ReserveStatsService.ReserveSnapshot snap) {
        ChatUi.banner(sender, "Server Reserve");

        String cur = plugin.currency();
        // Gross ledger (opening + post-reset net) â€” matches rootmc.net/reserve; can be negative.
        ChatUi.gold(sender, "Balance", money(snap.grossReserveBalance()), cur);
        ChatUi.gold(sender, "Notes", money(snap.noteSupply().totalNotesG()), cur);
        EconomyNoteSupplyDisplay.sendMintCatalog(plugin, sender, snap.noteSupply());

        if (sender instanceof Player player) {
            EconomyNoteSupplyDisplay.sendPlayerBondLines(plugin, player);
        }

        var month = snap.currentMonthTotals();
        ChatUi.entry(sender, "Month", snap.currentMonthKey() + " net " + money(month.net()) + " " + cur);

        if (snap.player() != null) {
            ReserveStatsService.PlayerMonthStatus p = snap.player();
            ChatUi.entry(sender, "You",
                    money(p.taxPaidMtd()) + " " + cur + " tax | "
                            + HstTime.formatPlaytime(p.monthlyPlaytimeSeconds()));
        }

        ChatUi.links(
                sender,
                "Reserve", RootMcEconomyWeb.reserve(),
                "Economy", RootMcEconomyWeb.economy(),
                "Constitution", RootMcEconomyWeb.constitution());
        ChatUi.tip(sender, "/tax  |  /economy");
    }

    private String money(double value) {
        return plugin.money(value);
    }
}
