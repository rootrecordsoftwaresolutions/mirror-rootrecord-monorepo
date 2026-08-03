package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.common.ChatUi;
import com.rootrecord.minecraft.rooteconomy.RootEconomyPlugin;
import com.rootrecord.minecraft.rootessentials.treasury.EconomyNoteSupplyDisplay;
import com.rootrecord.minecraft.rootessentials.treasury.ReserveLedgerTaxTiers;
import com.rootrecord.minecraft.rootessentials.treasury.TreasuryManager;
import com.rootrecord.minecraft.rootessentials.web.RootMcEconomyWeb;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

import java.util.Locale;

/** Live transaction tax rate â€” essentials only. */
public final class TaxCommand implements CommandExecutor {

    private final RootEconomyPlugin plugin;

    public TaxCommand(RootEconomyPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        try {
            sendTax(sender);
            return true;
        } catch (Exception ex) {
            sender.sendMessage(plugin.colorize("&cTax lookup failed: &f" + ex.getMessage()));
            return true;
        }
    }

    private void sendTax(CommandSender sender) {
        TreasuryManager treasury = plugin.treasury();
        ChatUi.banner(sender, "Taxes");

        if (treasury == null || !treasury.transactionTaxEnabled()) {
            ChatUi.entry(sender, "Transaction", "tax off | tell staff", "alert");
        } else {
            double effective = treasury.effectiveTransactionTaxRate();
            double effectivePct = effective * 100.0;

            if (treasury.dynamicTaxEnabled()) {
                double ledgerNet = treasury.currentLedgerNet();
                ChatUi.gold(sender, "Ledger", plugin.money(ledgerNet), plugin.currency());
                if (effective <= 0.000001) {
                    ChatUi.entry(sender, "Rate", "0%", "ok");
                } else {
                    ChatUi.entry(sender, "Rate", pct(effectivePct) + "%");
                    ChatUi.entry(sender, "Tier", ReserveLedgerTaxTiers.tierLabel(ledgerNet));
                }
            } else {
                ChatUi.entry(sender, "Rate", pct(effectivePct) + "%");
            }
            ChatUi.tip(sender, "Withheld on /pay, shops, /mint");
        }

        EconomyNoteSupplyDisplay.sendTownTaxLine(plugin, sender);
        ChatUi.links(
                sender,
                "Economy", RootMcEconomyWeb.economy(),
                "Constitution", "https://rootmc.net/wiki/constitution/#taxes-fees-reference");
        ChatUi.tip(sender, "/economy  |  /reserve");
    }

    private static String pct(double value) {
        return String.format(Locale.US, "%.1f", value);
    }
}
