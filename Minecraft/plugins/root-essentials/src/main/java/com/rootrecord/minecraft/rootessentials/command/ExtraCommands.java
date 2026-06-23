package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.util.Vector;

import java.util.Locale;

public final class ExtraCommands {

    private ExtraCommands() {}

    public static final class Ptime implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Ptime(RootEssentialsPlugin plugin) { this.plugin = plugin; }

        @Override
        public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!Permissions.has(sender, "ptime")) {
                sender.sendMessage(plugin.msg("no-permission"));
                return true;
            }
            Player target;
            int argIdx = 0;
            if (args.length > 0 && Bukkit.getPlayerExact(args[0]) != null) {
                if (!Permissions.has(sender, "ptime.others")) {
                    sender.sendMessage(plugin.msg("no-permission"));
                    return true;
                }
                target = Bukkit.getPlayerExact(args[0]);
                argIdx = 1;
            } else if (sender instanceof Player p) {
                target = p;
            } else {
                sender.sendMessage(plugin.msg("players-only"));
                return true;
            }
            if (args.length <= argIdx) {
                Long t = plugin.playerState().playerTime(target.getUniqueId());
                if (t == null) {
                    sender.sendMessage(plugin.colorize("&7" + target.getName() + " uses server time."));
                } else {
                    sender.sendMessage(plugin.colorize("&7" + target.getName() + " personal time: &f" + t + " &7ticks"));
                }
                return true;
            }
            String token = args[argIdx].toLowerCase(Locale.ROOT);
            Long ticks;
            if (token.equals("reset") || token.equals("normal") || token.equals("server")) {
                ticks = null;
            } else {
                ticks = switch (token) {
                    case "day" -> 1000L;
                    case "noon" -> 6000L;
                    case "night" -> 13000L;
                    case "midnight" -> 18000L;
                    default -> {
                        try {
                            yield Long.parseLong(token);
                        } catch (NumberFormatException ex) {
                            yield -1L;
                        }
                    }
                };
                if (ticks < 0) {
                    sender.sendMessage(plugin.colorize("&eUsage: /ptime [player] [day|night|noon|midnight|ticks|reset]"));
                    return true;
                }
            }
            plugin.playerState().setPlayerTime(target.getUniqueId(), ticks);
            if (ticks == null) {
                target.resetPlayerTime();
                sender.sendMessage(plugin.colorize("&aReset personal time for &f" + target.getName()));
            } else {
                target.setPlayerTime(ticks, false);
                sender.sendMessage(plugin.colorize("&aSet personal time for &f" + target.getName() + " &ato &f" + ticks));
            }
            return true;
        }
    }

    public static final class More implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public More(RootEssentialsPlugin plugin) { this.plugin = plugin; }

        @Override
        public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage(plugin.msg("players-only"));
                return true;
            }
            if (!Permissions.has(player, "more")) {
                player.sendMessage(plugin.msg("no-permission"));
                return true;
            }
            ItemStack hand = player.getInventory().getItemInMainHand();
            if (hand.getType().isAir()) {
                player.sendMessage(plugin.msg("sell-empty-hand"));
                return true;
            }
            hand.setAmount(hand.getMaxStackSize());
            player.sendMessage(plugin.colorize("&aStack filled."));
            return true;
        }
    }

    public static final class Workbench implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Workbench(RootEssentialsPlugin plugin) { this.plugin = plugin; }

        @Override
        public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage(plugin.msg("players-only"));
                return true;
            }
            if (!Permissions.has(player, "workbench")) {
                player.sendMessage(plugin.msg("no-permission"));
                return true;
            }
            player.openWorkbench(null, true);
            return true;
        }
    }

    public static final class Anvil implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Anvil(RootEssentialsPlugin plugin) { this.plugin = plugin; }

        @Override
        public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage(plugin.msg("players-only"));
                return true;
            }
            if (!Permissions.has(player, "anvil")) {
                player.sendMessage(plugin.msg("no-permission"));
                return true;
            }
            player.openAnvil(player.getLocation(), true);
            return true;
        }
    }

    public static final class Jump implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Jump(RootEssentialsPlugin plugin) { this.plugin = plugin; }

        @Override
        public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage(plugin.msg("players-only"));
                return true;
            }
            if (!Permissions.has(player, "jump")) {
                player.sendMessage(plugin.msg("no-permission"));
                return true;
            }
            int dist = 8;
            if (args.length >= 1) {
                try {
                    dist = Math.max(1, Math.min(64, Integer.parseInt(args[0])));
                } catch (NumberFormatException ex) {
                    player.sendMessage(plugin.msg("invalid-number"));
                    return true;
                }
            }
            Vector dir = player.getLocation().getDirection().normalize().multiply(dist);
            Location dest = player.getLocation().add(dir);
            dest.setY(player.getWorld().getHighestBlockYAt(dest) + 1);
            plugin.playerState().rememberBack(player);
            plugin.teleportPlayer(player, dest, () -> player.sendMessage(plugin.colorize("&aJumped forward.")));
            return true;
        }
    }
}
