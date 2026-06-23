package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public final class PayCommand implements CommandExecutor {

    private final RootEssentialsPlugin plugin;

    public PayCommand(RootEssentialsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (!Permissions.has(player, "pay")) {
            player.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        if (args.length < 2) {
            player.sendMessage(plugin.colorize("&eUsage: /pay <player> <amount>"));
            return true;
        }
        var target = plugin.getServer().getPlayerExact(args[0]);
        if (target == null) {
            player.sendMessage(plugin.msg("player-not-found").replace("{player}", args[0]));
            return true;
        }
        if (target.getUniqueId().equals(player.getUniqueId())) {
            player.sendMessage(plugin.msg("pay-self"));
            return true;
        }
        try {
            if (!plugin.acceptsPay(target.getUniqueId())) {
                player.sendMessage(plugin.msg("pay-disabled"));
                return true;
            }
        } catch (Exception ex) {
            player.sendMessage(plugin.colorize("&cPayment failed: &f" + ex.getMessage()));
            return true;
        }
        double amount;
        try {
            amount = Double.parseDouble(args[1]);
        } catch (NumberFormatException ex) {
            player.sendMessage(plugin.msg("invalid-number"));
            return true;
        }
        if (amount <= 0) {
            player.sendMessage(plugin.msg("pay-invalid-amount"));
            return true;
        }
        try {
            boolean ok = plugin.transfer(player, target, amount);
            if (!ok) {
                double bal = plugin.balance(player.getUniqueId(), player.getName());
                player.sendMessage(plugin.msg("pay-insufficient")
                        .replace("{amount}", plugin.money(amount))
                        .replace("{balance}", plugin.money(bal))
                        .replace("{currency}", plugin.currency()));
                return true;
            }
            player.sendMessage(plugin.msg("pay-sent")
                    .replace("{amount}", plugin.money(amount))
                    .replace("{player}", target.getName())
                    .replace("{currency}", plugin.currency()));
            target.sendMessage(plugin.msg("pay-received")
                    .replace("{amount}", plugin.money(amount))
                    .replace("{player}", player.getName())
                    .replace("{currency}", plugin.currency()));
            return true;
        } catch (Exception ex) {
            player.sendMessage(plugin.colorize("&cPayment failed: &f" + ex.getMessage()));
            return true;
        }
    }
}
