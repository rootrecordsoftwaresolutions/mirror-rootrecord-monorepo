package com.rootrecord.minecraft.rootexplore;

import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.List;
import java.util.Locale;

public final class ExploreCommand implements CommandExecutor, TabCompleter {

    private final RootExplorePlugin plugin;

    public ExploreCommand(RootExplorePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 1 && "reload".equalsIgnoreCase(args[0])) {
            if (!sender.hasPermission("rootexplore.reload")) {
                sender.sendMessage(plugin.msg("no-permission"));
                return true;
            }
            plugin.reloadLocalConfig();
            sender.sendMessage(plugin.msg("reload-done"));
            return true;
        }
        if (!(sender instanceof Player player)) {
            sender.sendMessage(plugin.msg("players-only"));
            return true;
        }
        if (args.length == 0) {
            boolean enabled = plugin.toggles().toggle(player.getUniqueId());
            sender.sendMessage(plugin.msg(enabled ? "toggle-on" : "toggle-off"));
            return true;
        }
        return switch (args[0].toLowerCase(Locale.ROOT)) {
            case "on", "enable" -> {
                plugin.toggles().setEnabled(player.getUniqueId(), true);
                yield send(player, "toggle-on");
            }
            case "off", "disable" -> {
                plugin.toggles().setEnabled(player.getUniqueId(), false);
                yield send(player, "toggle-off");
            }
            case "status" -> send(player, plugin.toggles().isEnabled(player.getUniqueId())
                    ? "toggle-status-on"
                    : "toggle-status-off");
            default -> {
                sender.sendMessage(plugin.colorize("&eUsage: /explore [on|off|status]"));
                yield true;
            }
        };
    }

    private boolean send(Player player, String key) {
        player.sendMessage(plugin.msg(key));
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            if (sender.hasPermission("rootexplore.reload")) {
                return List.of("on", "off", "status", "reload").stream()
                        .filter(s -> s.startsWith(args[0].toLowerCase(Locale.ROOT)))
                        .toList();
            }
            return List.of("on", "off", "status").stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase(Locale.ROOT)))
                    .toList();
        }
        return List.of();
    }
}
