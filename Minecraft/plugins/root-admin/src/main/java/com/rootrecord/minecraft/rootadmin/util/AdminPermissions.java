package com.rootrecord.minecraft.rootadmin.util;

import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.GameMode;

public final class AdminPermissions {

    private AdminPermissions() {}

    public static boolean has(CommandSender sender, String node) {
        if (sender.hasPermission("rootadmin." + node)) {
            return true;
        }
        if (sender.hasPermission("essentials." + node)) {
            return true;
        }
        if (sender.hasPermission("rootessentials." + node)) {
            return true;
        }
        return !(sender instanceof Player) && sender.isOp();
    }

    /** Mode-specific nodes win; blanket `gamemode` does not grant creative/adventure. */
    public static boolean canUseGamemode(CommandSender sender, GameMode mode) {
        String modeNode = switch (mode) {
            case SURVIVAL -> "gamemode.survival";
            case SPECTATOR -> "gamemode.spectator";
            case CREATIVE -> "gamemode.creative";
            case ADVENTURE -> "gamemode.adventure";
        };
        if (has(sender, modeNode)) {
            return true;
        }
        if (mode == GameMode.CREATIVE || mode == GameMode.ADVENTURE) {
            return false;
        }
        return has(sender, "gamemode");
    }
}
