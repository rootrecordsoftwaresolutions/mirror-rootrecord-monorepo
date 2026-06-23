package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.List;

public final class WarpCommands {

    private WarpCommands() {}

    public static final class Warp implements CommandExecutor, TabCompleter {
        private final RootEssentialsPlugin plugin;
        public Warp(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "warp")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            if (args.length < 1) { player.sendMessage(plugin.colorize("&eUsage: /warp <name>")); return true; }
            try {
                Location loc = plugin.warps().get(args[0]);
                if (loc == null) { player.sendMessage(plugin.colorize("&eWarp &f" + args[0] + " &enot found.")); return true; }
                plugin.playerState().rememberBack(player);
                plugin.teleportPlayer(player, loc, () -> player.sendMessage(plugin.colorize("&aWarped to &f" + args[0] + "&a.")));
            } catch (Exception ex) {
                player.sendMessage(plugin.colorize("&cWarp failed: &f" + ex.getMessage()));
            }
            return true;
        }
        @Override public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
            if (args.length != 1) return List.of();
            try { return plugin.warps().names().stream().filter(n -> n.startsWith(args[0].toLowerCase())).toList(); }
            catch (Exception ex) { return List.of(); }
        }
    }

    public static final class Warps implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Warps(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!Permissions.has(sender, "warps")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            try {
                List<String> names = plugin.warps().names();
                if (names.isEmpty()) { sender.sendMessage(plugin.colorize("&7No warps configured.")); return true; }
                sender.sendMessage(plugin.colorize("&7Warps (&f" + names.size() + "&7): &f" + String.join(", ", names)));
            } catch (Exception ex) {
                sender.sendMessage(plugin.colorize("&cCould not list warps."));
            }
            return true;
        }
    }
}
