package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

public final class MintCommand implements CommandExecutor {

    private final RootEssentialsPlugin plugin;

    public MintCommand(RootEssentialsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(plugin.msg("players-only"));
            return true;
        }
        if (!Permissions.has(player, "mint")) {
            player.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        if (args.length < 1) {
            player.sendMessage(plugin.colorize("&eUsage: /mint <hand|all>"));
            return true;
        }
        try {
            return switch (args[0].toLowerCase()) {
                case "hand" -> mintHand(player);
                case "all" -> mintAll(player);
                default -> {
                    player.sendMessage(plugin.colorize("&eUsage: /mint <hand|all>"));
                    yield true;
                }
            };
        } catch (Exception ex) {
            player.sendMessage(plugin.colorize("&cMint failed: &f" + ex.getMessage()));
            return true;
        }
    }

    private boolean mintHand(Player player) throws Exception {
        ItemStack hand = player.getInventory().getItemInMainHand();
        if (hand == null || hand.getType().isAir()) {
            player.sendMessage(plugin.msg("sell-empty-hand"));
            return true;
        }
        Double each = plugin.mintRate(hand.getType());
        if (each == null || each <= 0) {
            player.sendMessage(plugin.msg("mint-not-gold").replace("{item}", hand.getType().name()));
            return true;
        }
        int amount = hand.getAmount();
        hand.setAmount(0);
        double total = each * amount;
        plugin.depositIncome(player.getUniqueId(), player.getName(), total);
        player.sendMessage(plugin.msg("mint-success")
                .replace("{count}", String.valueOf(amount))
                .replace("{amount}", plugin.money(total))
                .replace("{currency}", plugin.currency()));
        return true;
    }

    private boolean mintAll(Player player) throws Exception {
        int minted = 0;
        double total = 0;
        var inv = player.getInventory();
        for (int slot = 0; slot < inv.getSize(); slot++) {
            ItemStack stack = inv.getItem(slot);
            if (stack == null || stack.getType().isAir()) continue;
            Double each = plugin.mintRate(stack.getType());
            if (each == null || each <= 0) continue;
            minted += stack.getAmount();
            total += each * stack.getAmount();
            inv.setItem(slot, null);
        }
        if (minted <= 0 || total <= 0) {
            player.sendMessage(plugin.msg("mint-nothing"));
            return true;
        }
        plugin.depositIncome(player.getUniqueId(), player.getName(), total);
        player.sendMessage(plugin.msg("mint-success")
                .replace("{count}", String.valueOf(minted))
                .replace("{amount}", plugin.money(total))
                .replace("{currency}", plugin.currency()));
        return true;
    }
}
