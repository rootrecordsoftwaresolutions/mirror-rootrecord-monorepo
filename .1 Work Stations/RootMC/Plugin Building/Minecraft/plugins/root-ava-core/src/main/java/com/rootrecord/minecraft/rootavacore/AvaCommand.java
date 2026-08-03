package com.rootrecord.minecraft.rootavacore;

import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;

import java.util.Collections;
import java.util.List;
import java.util.Locale;

public final class AvaCommand implements CommandExecutor, TabCompleter {

    private final RootAvaCorePlugin plugin;

    public AvaCommand(RootAvaCorePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length > 0 && "reload".equalsIgnoreCase(args[0])) {
            if (!sender.hasPermission("rootavacore.admin")) {
                sender.sendMessage(plugin.colorize(plugin.config().noPermission()));
                return true;
            }
            plugin.reloadAll();
            sender.sendMessage(plugin.colorize(plugin.config().reloaded()));
            return true;
        }

        if (!sender.hasPermission("rootavacore.use")) {
            sender.sendMessage(plugin.colorize(plugin.config().noPermission()));
            return true;
        }
        if (!plugin.config().enabled()) {
            sender.sendMessage(plugin.colorize(plugin.config().disabled()));
            return true;
        }

        int online = Bukkit.getOnlinePlayers().size();
        String tpsText = formatTps();
        String line = plugin.config().statusLine()
                .replace("{version}", plugin.getDescription().getVersion())
                .replace("{online}", String.valueOf(online))
                .replace("{tps}", tpsText);
        sender.sendMessage(plugin.colorize(plugin.config().prefix() + line));
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1 && sender.hasPermission("rootavacore.admin")) {
            String partial = args[0].toLowerCase(Locale.ROOT);
            if ("reload".startsWith(partial)) {
                return List.of("reload");
            }
        }
        return Collections.emptyList();
    }

    private static String formatTps() {
        try {
            double[] tps = Bukkit.getTPS();
            if (tps != null && tps.length > 0) {
                double v = Math.min(20.0, tps[0]);
                return String.format(Locale.US, "%.1f", v);
            }
        } catch (Throwable ignored) {
            // Soft signal only — TPS may be unavailable on non-Paper forks.
        }
        return "n/a";
    }
}
