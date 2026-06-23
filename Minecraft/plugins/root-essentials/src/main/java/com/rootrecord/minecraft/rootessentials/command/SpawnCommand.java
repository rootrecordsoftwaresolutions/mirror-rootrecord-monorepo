package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public final class SpawnCommand implements CommandExecutor {

    private final RootEssentialsPlugin plugin;

    public SpawnCommand(RootEssentialsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (!Permissions.has(player, "spawn")) {
            player.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        var spawn = plugin.spawnLocation(player);
        if (spawn == null) {
            player.sendMessage(plugin.msg("spawn-unavailable"));
            return true;
        }
        plugin.playerState().rememberBack(player);
        plugin.teleportPlayer(player, spawn, () -> player.sendMessage(plugin.msg("spawn-teleport")));
        return true;
    }
}
