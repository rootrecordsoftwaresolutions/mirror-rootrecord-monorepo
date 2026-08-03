package com.rootrecord.minecraft.rootask.command;

import com.rootrecord.minecraft.rootask.RootAskPlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class AskCommand implements CommandExecutor, TabCompleter {

    private final RootAskPlugin plugin;
    private final Map<UUID, Long> lastAskAt = new ConcurrentHashMap<>();

    public AskCommand(RootAskPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (!player.hasPermission("rootask.use")) {
            player.sendMessage(plugin.colorize("&cYou cannot use /ask."));
            return true;
        }
        if (args.length < 1) {
            player.sendMessage(plugin.msg("usage"));
            return true;
        }

        String first = args[0].toLowerCase(Locale.ROOT);
        if ("yes".equals(first) || "no".equals(first)) {
            if (!plugin.guideService().sessions().hasActiveSession(player.getUniqueId())) {
                player.sendMessage(plugin.msg("feedback-none"));
                return true;
            }
            plugin.guideService().submitFeedback(player, "yes".equals(first));
            return true;
        }

        String question = String.join(" ", args).trim();
        if (question.length() < 3) {
            player.sendMessage(plugin.msg("too-short"));
            return true;
        }
        int maxLen = plugin.askConfig().maxQuestionLength();
        if (question.length() > maxLen) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("too-long").replace("{max}", String.valueOf(maxLen))));
            return true;
        }

        if (!player.hasPermission("rootask.bypass.cooldown")) {
            long now = System.currentTimeMillis();
            long last = lastAskAt.getOrDefault(player.getUniqueId(), 0L);
            long cooldownMs = plugin.askConfig().cooldownSeconds() * 1000L;
            long remaining = cooldownMs - (now - last);
            if (remaining > 0) {
                int seconds = (int) Math.ceil(remaining / 1000.0);
                player.sendMessage(plugin.colorize(
                        plugin.rawMsg("cooldown").replace("{seconds}", String.valueOf(seconds))));
                return true;
            }
        }

        lastAskAt.put(player.getUniqueId(), System.currentTimeMillis());
        plugin.guideService().submitQuestion(player, question);
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            if (sender instanceof Player player
                    && plugin.guideService().sessions().hasActiveSession(player.getUniqueId())) {
                return List.of("yes", "no");
            }
            return List.of("How", "What", "Where");
        }
        return List.of();
    }
}
