package com.rootrecord.minecraft.rootquestionnaire.command;

import com.rootrecord.minecraft.rootquestionnaire.RootQuestionnairePlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public final class RootQuestionnaireAdminCommand implements CommandExecutor {

    private final RootQuestionnairePlugin plugin;

    public RootQuestionnaireAdminCommand(RootQuestionnairePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("rootquestionnaire.reload")) {
            sender.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        if (args.length == 0 || !args[0].equalsIgnoreCase("reload")) {
            sender.sendMessage(plugin.colorize("&7Usage: /rootquestionnaire reload"));
            return true;
        }
        plugin.reloadLocalConfig();
        sender.sendMessage(plugin.msg("reload-done"));
        return true;
    }
}
