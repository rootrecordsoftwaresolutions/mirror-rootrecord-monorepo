package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.Damageable;

public final class PlayerUtilCommands {

    private PlayerUtilCommands() {}

    private static Player target(CommandSender sender, String[] args, int idx) {
        if (args.length > idx) return Bukkit.getPlayerExact(args[idx]);
        return sender instanceof Player p ? p : null;
    }

    public static final class Feed implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Feed(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            Player t = target(sender, args, 0);
            if (t == null) { sender.sendMessage(plugin.msg("player-not-found").replace("{player}", args.length > 0 ? args[0] : "?")); return true; }
            boolean self = sender instanceof Player p && p.getUniqueId().equals(t.getUniqueId());
            if (!self && !Permissions.has(sender, "feed.others")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            if (self && !Permissions.has(sender, "feed")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            t.setFoodLevel(20);
            t.setSaturation(20f);
            sender.sendMessage(plugin.colorize("&aFed &f" + t.getName()));
            return true;
        }
    }

    public static final class Heal implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Heal(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            Player t = target(sender, args, 0);
            if (t == null) { sender.sendMessage(plugin.msg("player-not-found").replace("{player}", args.length > 0 ? args[0] : "?")); return true; }
            boolean self = sender instanceof Player p && p.getUniqueId().equals(t.getUniqueId());
            if (!self && !Permissions.has(sender, "heal.others")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            if (self && !Permissions.has(sender, "heal")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            t.setHealth(t.getMaxHealth());
            t.setFireTicks(0);
            t.setFoodLevel(20);
            sender.sendMessage(plugin.colorize("&aHealed &f" + t.getName()));
            return true;
        }
    }

    public static final class Repair implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Repair(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "repair")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            boolean all = args.length > 0 && "all".equalsIgnoreCase(args[0]);
            if (all) {
                int count = 0;
                for (ItemStack item : player.getInventory().getContents()) {
                    if (item == null || item.getType().isAir() || !(item.getItemMeta() instanceof Damageable d)) continue;
                    d.setDamage(0);
                    item.setItemMeta((org.bukkit.inventory.meta.ItemMeta) d);
                    count++;
                }
                player.sendMessage(plugin.colorize("&aRepaired &f" + count + " &aitems."));
                return true;
            }
            ItemStack item = player.getInventory().getItemInMainHand();
            if (item.getType().isAir() || !(item.getItemMeta() instanceof Damageable d)) {
                player.sendMessage(plugin.colorize("&eHold a repairable item."));
                return true;
            }
            d.setDamage(0);
            item.setItemMeta((org.bukkit.inventory.meta.ItemMeta) d);
            player.sendMessage(plugin.colorize("&aItem repaired."));
            return true;
        }
    }

    public static final class Top implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Top(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "top")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            Location loc = player.getLocation();
            int y = loc.getWorld().getHighestBlockYAt(loc);
            plugin.playerState().rememberBack(player);
            Location dest = new Location(loc.getWorld(), loc.getX(), y + 1, loc.getZ(), loc.getYaw(), loc.getPitch());
            plugin.teleportPlayer(player, dest, () -> player.sendMessage(plugin.colorize("&aTeleported to top.")));
            return true;
        }
    }

    public static final class Clear implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Clear(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            Player t = args.length > 0 ? Bukkit.getPlayerExact(args[0]) : (sender instanceof Player p ? p : null);
            if (t == null) { sender.sendMessage(plugin.msg("player-not-found").replace("{player}", args.length > 0 ? args[0] : "?")); return true; }
            boolean self = sender instanceof Player p && p.getUniqueId().equals(t.getUniqueId());
            if (!self && !Permissions.has(sender, "clearinventory.others")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            if (self && !Permissions.has(sender, "clearinventory")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            t.getInventory().clear();
            sender.sendMessage(plugin.colorize("&aCleared inventory for &f" + t.getName()));
            return true;
        }
    }

    public static final class Trash implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Trash(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "disposal")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            player.openInventory(Bukkit.createInventory(player, 27, plugin.colorize("&8Trash")));
            return true;
        }
    }

    public static final class Suicide implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Suicide(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "suicide")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            player.setHealth(0);
            return true;
        }
    }

    public static final class Seen implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Seen(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!Permissions.has(sender, "seen")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            if (args.length < 1) { sender.sendMessage(plugin.colorize("&eUsage: /seen <player>")); return true; }
            var off = Bukkit.getOfflinePlayer(args[0]);
            if (!off.hasPlayedBefore() && !off.isOnline()) {
                sender.sendMessage(plugin.msg("player-not-found").replace("{player}", args[0]));
                return true;
            }
            if (off.isOnline()) {
                sender.sendMessage(plugin.colorize("&f" + off.getName() + " &ais online now."));
            } else {
                long ago = System.currentTimeMillis() - off.getLastPlayed();
                sender.sendMessage(plugin.colorize("&f" + off.getName() + " &7last seen &f" + (ago / 60000L) + "m &7ago."));
            }
            return true;
        }
    }
}
