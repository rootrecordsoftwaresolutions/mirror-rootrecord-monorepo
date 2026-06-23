package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

public final class SellCommand implements CommandExecutor {

    private final RootEssentialsPlugin plugin;

    public SellCommand(RootEssentialsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (!Permissions.has(player, "sell")) {
            player.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        if (args.length < 1) {
            player.sendMessage(plugin.colorize("&eUsage: /sell <hand|all|blocks> [amount]"));
            return true;
        }
        try {
            return switch (args[0].toLowerCase()) {
                case "hand" -> sellHand(player, args);
                case "all" -> sellAll(player, false);
                case "blocks" -> sellAll(player, true);
                default -> {
                    player.sendMessage(plugin.colorize("&eUsage: /sell <hand|all|blocks> [amount]"));
                    yield true;
                }
            };
        } catch (Exception ex) {
            player.sendMessage(plugin.colorize("&cSell failed: &f" + ex.getMessage()));
            return true;
        }
    }

    private boolean sellHand(Player player, String[] args) throws Exception {
        ItemStack hand = player.getInventory().getItemInMainHand();
        if (hand == null || hand.getType().isAir() || hand.getAmount() <= 0) {
            player.sendMessage(plugin.msg("sell-empty-hand"));
            return true;
        }
        Double each = plugin.itemPrice(hand.getType());
        if (each == null || each <= 0) {
            player.sendMessage(plugin.msg("sell-not-priced").replace("{item}", hand.getType().name()));
            return true;
        }
        int amount = hand.getAmount();
        if (args.length >= 2) {
            amount = Math.max(1, Math.min(hand.getAmount(), Integer.parseInt(args[1])));
        }
        hand.setAmount(hand.getAmount() - amount);
        double total = each * amount;
        plugin.depositIncome(player.getUniqueId(), player.getName(), total);
        player.sendMessage(plugin.msg("sell-success")
                .replace("{count}", String.valueOf(amount))
                .replace("{amount}", plugin.money(total))
                .replace("{currency}", plugin.currency()));
        return true;
    }

    private boolean sellAll(Player player, boolean blocksOnly) throws Exception {
        int sold = 0;
        double total = 0;
        var inv = player.getInventory();
        for (int slot = 0; slot < inv.getSize(); slot++) {
            ItemStack stack = inv.getItem(slot);
            if (stack == null || stack.getType().isAir() || stack.getAmount() <= 0) {
                continue;
            }
            Material type = stack.getType();
            if (blocksOnly && !type.isBlock()) {
                continue;
            }
            Double each = plugin.itemPrice(type);
            if (each == null || each <= 0) {
                continue;
            }
            sold += stack.getAmount();
            total += each * stack.getAmount();
            inv.setItem(slot, null);
        }
        if (sold <= 0 || total <= 0) {
            player.sendMessage(plugin.msg("sell-nothing"));
            return true;
        }
        plugin.depositIncome(player.getUniqueId(), player.getName(), total);
        player.sendMessage(plugin.msg("sell-success")
                .replace("{count}", String.valueOf(sold))
                .replace("{amount}", plugin.money(total))
                .replace("{currency}", plugin.currency()));
        return true;
    }
}
