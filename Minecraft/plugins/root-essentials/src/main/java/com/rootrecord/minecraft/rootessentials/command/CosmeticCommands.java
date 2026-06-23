package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

public final class CosmeticCommands {

    private CosmeticCommands() {}

    public static final class Nick implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Nick(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "nick")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            if (args.length < 1) {
                player.setDisplayName(player.getName());
                player.setPlayerListName(player.getName());
                player.sendMessage(plugin.colorize("&7Nickname cleared."));
                return true;
            }
            String nick = String.join(" ", args);
            if (Permissions.has(player, "nick.color") || Permissions.has(player, "chat.color")) {
                nick = plugin.colorize(nick.replace('&', '\u00A7'));
            }
            player.setDisplayName(nick);
            player.setPlayerListName(nick.length() > 16 ? nick.substring(0, 16) : nick);
            player.sendMessage(plugin.colorize("&aNickname set."));
            return true;
        }
    }

    public static final class Hat implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Hat(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "hat")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            ItemStack hand = player.getInventory().getItemInMainHand();
            if (hand == null || hand.getType().isAir()) {
                player.sendMessage(plugin.msg("sell-empty-hand"));
                return true;
            }
            ItemStack helmet = player.getInventory().getHelmet();
            player.getInventory().setHelmet(hand.clone());
            player.getInventory().setItemInMainHand(helmet);
            player.sendMessage(plugin.colorize("&aHat equipped."));
            return true;
        }
    }
}
