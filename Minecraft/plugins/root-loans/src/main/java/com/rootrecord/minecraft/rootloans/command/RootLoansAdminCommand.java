package com.rootrecord.minecraft.rootloans.command;

import com.rootrecord.minecraft.rootloans.RootLoansPlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public final class RootLoansAdminCommand implements CommandExecutor {

    private final RootLoansPlugin plugin;

    public RootLoansAdminCommand(RootLoansPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("rootloans.reload")) {
            sender.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        if (args.length == 1 && "reload".equalsIgnoreCase(args[0])) {
            plugin.reloadLocalConfig();
            sender.sendMessage(plugin.msg("reload-done"));
            return true;
        }
        sender.sendMessage(plugin.colorize("&eUsage: /rootloans reload"));
        return true;
    }
}
