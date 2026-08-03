package com.rootrecord.minecraft.rootquestionnaire.command;

import com.rootrecord.minecraft.rootquestionnaire.RootQuestionnairePlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.List;

public final class QuestionairCommand implements CommandExecutor, TabCompleter {

    private final RootQuestionnairePlugin plugin;

    public QuestionairCommand(RootQuestionnairePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(plugin.msg("players-only"));
            return true;
        }
        if (args.length > 0 && args[0].equalsIgnoreCase("cancel")) {
            if (plugin.sessions().remove(player.getUniqueId()) != null) {
                player.sendMessage(plugin.msg("cancelled"));
            } else {
                player.sendMessage(plugin.colorize("&7No active survey session."));
            }
            return true;
        }
        if (args.length > 0 && args[0].equalsIgnoreCase("status")) {
            plugin.service().sendStatus(player);
            return true;
        }
        plugin.service().beginSurvey(player);
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return List.of("cancel", "status").stream()
                    .filter(s -> s.startsWith(args[0].toLowerCase()))
                    .toList();
        }
        return List.of();
    }
}
