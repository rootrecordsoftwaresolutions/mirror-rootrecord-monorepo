package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public final class EconomyCommands {

    private EconomyCommands() {}

    public static final class Baltop implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Baltop(RootEssentialsPlugin plugin) { this.plugin = plugin; }

        @Override
        public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!Permissions.has(sender, "balancetop") && !Permissions.has(sender, "baltop")) {
                sender.sendMessage(plugin.msg("no-permission"));
                return true;
            }
            int limit = 10;
            if (args.length >= 1) {
                try {
                    limit = Math.min(50, Math.max(1, Integer.parseInt(args[0])));
                } catch (NumberFormatException ex) {
                    sender.sendMessage(plugin.msg("invalid-number"));
                    return true;
                }
            }
            try {
                var rows = plugin.topBalances(limit);
                if (rows.isEmpty()) {
                    sender.sendMessage(plugin.colorize("&7No balances recorded yet."));
                    return true;
                }
                sender.sendMessage(plugin.colorize("&aTop balances (&f" + rows.size() + "&a):"));
                int rank = 1;
                for (var row : rows) {
                    sender.sendMessage(plugin.colorize("&7#" + rank++ + " &f" + row.username() + " &7— &f"
                            + plugin.money(row.balance()) + " " + plugin.currency()));
                }
                return true;
            } catch (Exception ex) {
                sender.sendMessage(plugin.colorize("&cBaltop failed: &f" + ex.getMessage()));
                return true;
            }
        }
    }

    public static final class Paytoggle implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Paytoggle(RootEssentialsPlugin plugin) { this.plugin = plugin; }

        @Override
        public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage(plugin.msg("players-only"));
                return true;
            }
            if (!Permissions.has(player, "paytoggle")) {
                player.sendMessage(plugin.msg("no-permission"));
                return true;
            }
            try {
                boolean enabled = plugin.toggleAcceptsPay(player.getUniqueId());
                player.sendMessage(plugin.msg(enabled ? "paytoggle-on" : "paytoggle-off"));
                return true;
            } catch (Exception ex) {
                player.sendMessage(plugin.colorize("&cPay toggle failed: &f" + ex.getMessage()));
                return true;
            }
        }
    }
}
