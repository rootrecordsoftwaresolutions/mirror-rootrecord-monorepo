package com.rootrecord.minecraft.rootupkeep.util;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.command.CommandSender;

public final class Messages {

    private Messages() {}

    public static void send(CommandSender sender, String raw) {
        sender.sendMessage(colorize(raw));
    }

    public static void broadcast(String raw) {
        Bukkit.broadcastMessage(colorize(raw));
    }

    public static String colorize(String raw) {
        return ChatColor.translateAlternateColorCodes('&', raw == null ? "" : raw);
    }
}
