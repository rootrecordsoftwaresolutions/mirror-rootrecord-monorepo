package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.List;

public final class InfoCommands {

    private InfoCommands() {}

    public static final class Help implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Help(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!Permissions.has(sender, "help")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            sender.sendMessage(plugin.colorize("&7Use &f/cmds &7for the full command list."));
            return true;
        }
    }

    public static final class List implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public List(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!Permissions.has(sender, "list")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            StringBuilder sb = new StringBuilder(plugin.colorize("&7Online (&f" + Bukkit.getOnlinePlayers().size() + "&7): "));
            for (Player p : Bukkit.getOnlinePlayers()) {
                String name = plugin.playerState().isAfk(p.getUniqueId()) ? p.getName() + " (AFK)" : p.getName();
                sb.append("&f").append(name).append("&7, ");
            }
            sender.sendMessage(sb.toString().replaceAll(", $", ""));
            return true;
        }
    }

    public static final class Motd implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Motd(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!Permissions.has(sender, "motd")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            for (String line : plugin.motdLines()) sender.sendMessage(plugin.colorize(line));
            return true;
        }
    }

    public static final class Rules implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Rules(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!Permissions.has(sender, "rules")) { sender.sendMessage(plugin.msg("no-permission")); return true; }
            sender.sendMessage(plugin.colorize("&7Use &f/rules &7(RootHelp) or wiki for full rules."));
            for (String line : plugin.rulesLines()) sender.sendMessage(plugin.colorize(line));
            return true;
        }
    }

    public static final class Ping implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Ping(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "ping")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            player.sendMessage(plugin.colorize("&7Ping: &f" + player.getPing() + "ms"));
            return true;
        }
    }

    public static final class Compass implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Compass(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "compass")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            int yaw = (int) ((player.getLocation().getYaw() % 360 + 360) % 360);
            String dir = yaw < 45 || yaw >= 315 ? "N" : yaw < 135 ? "E" : yaw < 225 ? "S" : "W";
            player.sendMessage(plugin.colorize("&7Facing: &f" + dir + " &7(" + yaw + "°)"));
            return true;
        }
    }

    public static final class Depth implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Depth(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "depth")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            player.sendMessage(plugin.colorize("&7Depth: &f" + player.getLocation().getBlockY()));
            return true;
        }
    }

    public static final class GetPos implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public GetPos(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "getpos")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            var loc = player.getLocation();
            player.sendMessage(plugin.colorize("&7Pos: &f" + loc.getBlockX() + ", " + loc.getBlockY() + ", " + loc.getBlockZ()
                    + " &7in &f" + loc.getWorld().getName()));
            return true;
        }
    }

    public static final class Worth implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Worth(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "worth")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            Material mat = player.getInventory().getItemInMainHand().getType();
            if (mat.isAir()) { player.sendMessage(plugin.msg("sell-empty-hand")); return true; }
            Double each = plugin.itemPrice(mat);
            if (each == null || each <= 0) {
                player.sendMessage(plugin.msg("sell-not-priced").replace("{item}", mat.name()));
                return true;
            }
            String source = plugin.marketBridgeAvailable() ? "market avg" : "worth table";
            player.sendMessage(plugin.colorize("&7Worth (&f" + source + "&7): &f" + mat.name()
                    + " &7= &f" + plugin.money(each) + " " + plugin.currency()));
            return true;
        }
    }

    public static final class Near implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Near(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "near")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            int radius = 200;
            StringBuilder sb = new StringBuilder(plugin.colorize("&7Nearby: "));
            for (Player other : player.getWorld().getPlayers()) {
                if (other.equals(player) || player.getLocation().distanceSquared(other.getLocation()) > radius * radius) continue;
                sb.append("&f").append(other.getName()).append("&7, ");
            }
            String out = sb.toString().replaceAll(", $", "");
            player.sendMessage(out.endsWith(": ") ? plugin.colorize("&7Nearby: &enone") : out);
            return true;
        }
    }

    public static final class Afk implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Afk(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "afk")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            boolean now = plugin.playerState().toggleAfk(player.getUniqueId());
            Bukkit.broadcastMessage(plugin.colorize(now ? "&7" + player.getName() + " is now AFK." : "&7" + player.getName() + " is no longer AFK."));
            return true;
        }
    }
}
