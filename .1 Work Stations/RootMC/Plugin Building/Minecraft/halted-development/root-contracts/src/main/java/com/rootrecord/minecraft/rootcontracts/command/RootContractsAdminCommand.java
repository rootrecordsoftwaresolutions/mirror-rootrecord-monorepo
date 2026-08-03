package com.rootrecord.minecraft.rootcontracts.command;

import com.rootrecord.minecraft.rootcontracts.RootContractsPlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public final class RootContractsAdminCommand implements CommandExecutor {

    private final RootContractsPlugin plugin;

    public RootContractsAdminCommand(RootContractsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("rootcontracts.reload")) {
            sender.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        plugin.reloadLocalConfig();
        sender.sendMessage(plugin.msg("reload-done"));
        return true;
    }
}
