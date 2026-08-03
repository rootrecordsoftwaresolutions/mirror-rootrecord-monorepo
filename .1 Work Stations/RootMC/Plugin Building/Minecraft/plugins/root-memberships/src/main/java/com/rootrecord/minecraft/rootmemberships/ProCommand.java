package com.rootrecord.minecraft.rootmemberships;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.List;

/**
 * Player-friendly Pro membership links + details.
 *
 * These are the masked/custom `/pro/...` URLs (Pages redirect to Stripe checkout).
 */
public final class ProCommand implements CommandExecutor, TabCompleter {

    private static final String LINK_MONTHLY = "https://rootmc.net/pro/monthly";
    private static final String LINK_ONE_MONTH = "https://rootmc.net/pro/one-month";
    private static final String LINK_LIFETIME = "https://rootmc.net/pro/lifetime";

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (args != null && args.length > 0) {
            player.sendMessage("§eUsage: /pro");
            return true;
        }

        // Keep each line short: Minecraft chat truncation varies by host/client.
        player.sendMessage("§6--- §bRootMC Pro Membership §6---");
        player.sendMessage("§7Enter your §bMinecraft username§7 at checkout (case-sensitive).");
        player.sendMessage("");

        player.sendMessage("§b$4.99/month§7 — Monthly Pro subscription:");
        player.sendMessage("§f" + LINK_MONTHLY);
        player.sendMessage("§7Active while the subscription is active (not an item).");
        player.sendMessage("");

        player.sendMessage("§b$4.99 one-time§7 — 1-month Pro voucher to your §b/vault§7:");
        player.sendMessage("§f" + LINK_ONE_MONTH);
        player.sendMessage("§8Tradeable until redeemed in-game.");
        player.sendMessage("");

        player.sendMessage("§b$75 one-time§7 — Lifetime Pro voucher to your §b/vault§7:");
        player.sendMessage("§f" + LINK_LIFETIME);
        player.sendMessage("§7Redeem for permanent Lifetime.");
        player.sendMessage("");

        player.sendMessage("§7Weekly Top Active Player refresh:");
        player.sendMessage("§bTop 3§7 get the §b[Top Active Player]§7 prefix.");
        player.sendMessage("§b#1§7 also gets one week of §bPro§7.");

        player.sendMessage("");
        player.sendMessage("§7We’re adding more value to Pro—suggestions welcome.");
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        return List.of();
    }
}

