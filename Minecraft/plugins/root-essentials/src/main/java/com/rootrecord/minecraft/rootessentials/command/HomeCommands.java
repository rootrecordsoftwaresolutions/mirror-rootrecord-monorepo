package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public final class HomeCommands implements CommandExecutor {

    private final RootEssentialsPlugin plugin;
    private final String mode;

    public HomeCommands(RootEssentialsPlugin plugin, String mode) {
        this.plugin = plugin;
        this.mode = mode;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        String perm = switch (mode) {
            case "set" -> "sethome";
            case "del" -> "delhome";
            default -> "home";
        };
        if (!Permissions.has(player, perm)) {
            player.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        String name = args.length > 0 ? args[0] : plugin.defaultHomeName();
        try {
            return switch (mode) {
                case "set" -> setHome(player, name);
                case "go" -> goHome(player, name);
                case "del" -> delHome(player, name);
                default -> true;
            };
        } catch (Exception ex) {
            player.sendMessage(plugin.colorize("&cHome command failed: &f" + ex.getMessage()));
            return true;
        }
    }

    private boolean setHome(Player player, String name) throws Exception {
        int max = plugin.maxHomes(player);
        int current = plugin.homeCount(player.getUniqueId());
        if (current >= max && !plugin.hasHome(player.getUniqueId(), name)) {
            player.sendMessage(plugin.msg("sethome-limit").replace("{max}", String.valueOf(max)));
            return true;
        }
        plugin.setHome(player.getUniqueId(), name, player.getLocation());
        player.sendMessage(plugin.msg("sethome-saved").replace("{name}", name));
        return true;
    }

    private boolean goHome(Player player, String name) throws Exception {
        var loc = plugin.getHome(player.getUniqueId(), name);
        if (loc == null) {
            player.sendMessage(plugin.msg("home-missing").replace("{name}", name));
            return true;
        }
        plugin.playerState().rememberBack(player);
        plugin.teleportPlayer(player, loc, () -> player.sendMessage(plugin.msg("home-teleport").replace("{name}", name)));
        return true;
    }

    private boolean delHome(Player player, String name) throws Exception {
        boolean ok = plugin.deleteHome(player.getUniqueId(), name);
        if (!ok) {
            player.sendMessage(plugin.msg("home-missing").replace("{name}", name));
            return true;
        }
        player.sendMessage(plugin.msg("delhome-done").replace("{name}", name));
        return true;
    }
}
