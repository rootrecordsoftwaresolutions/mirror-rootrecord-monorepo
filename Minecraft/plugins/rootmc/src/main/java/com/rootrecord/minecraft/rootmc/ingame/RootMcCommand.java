package com.rootrecord.minecraft.rootmc.ingame;

import com.rootrecord.minecraft.rootmc.RootMcPlugin;
import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.List;
import java.util.Locale;

public final class RootMcCommand implements CommandExecutor, TabCompleter {

    private static final List<String> ROOTMC_SUBCOMMANDS =
            List.of("waypoint", "note", "notes", "waypoints", "vault", "link", "value", "map");

    private final RootMcPlugin plugin;
    private final IngameEventBuffer buffer;

    public RootMcCommand(RootMcPlugin plugin, IngameEventBuffer buffer) {
        this.plugin = plugin;
        this.buffer = buffer;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        String name = command.getName().toLowerCase(Locale.ROOT);
        if (name.equals("rootmc") || name.equals("rmc")) {
            return handleRootMcSubcommand(sender, label, args);
        }
        return switch (name) {
            case "link" -> delegateRootStat(sender);
            case "waypoint", "wp" -> handleWaypoint(sender, label, args, 0);
            case "note" -> handleNote(sender, label, args, 0);
            case "notes" -> handleListNotes(sender);
            case "waypoints" -> handleListWaypoints(sender);
            case "vault" -> handleVault(sender);
            default -> false;
        };
    }

    private boolean handleRootMcSubcommand(CommandSender sender, String label, String[] args) {
        if (args.length == 0) {
            sender.sendMessage(plugin.colorize(
                    "&eUsage: /" + label + " <waypoint|note|vault|link|value|map> &7(or use &f/link &7, &f/waypoint &7, … directly)"));
            return true;
        }
        String sub = args[0].toLowerCase(Locale.ROOT);
        return switch (sub) {
            case "waypoint", "wp" -> handleWaypoint(sender, label, args, 1);
            case "note" -> handleNote(sender, label, args, 1);
            case "notes" -> handleListNotes(sender);
            case "waypoints" -> handleListWaypoints(sender);
            case "vault" -> handleVault(sender);
            case "link" -> delegateRootStat(sender);
            case "value" -> delegateRootStatValue(sender, args);
            case "map" -> delegateMap(sender);
            default -> {
                sender.sendMessage(plugin.colorize("&eUsage: /" + label + " <waypoint|note|vault|link|value|map>"));
                yield true;
            }
        };
    }

    private boolean delegateRootStat(CommandSender sender) {
        var rootstat = plugin.getCommand("rootstat");
        if (rootstat != null && rootstat.getExecutor() != null) {
            return rootstat.getExecutor().onCommand(sender, rootstat, "rootstat", new String[] { "link" });
        }
        sender.sendMessage(plugin.colorize("&eRun &f/link &7or &f/rootstat link &7to verify your account."));
        return true;
    }

    private boolean delegateRootStatValue(CommandSender sender, String[] args) {
        var rootstat = plugin.getCommand("rootstat");
        String[] forwarded = new String[args.length];
        forwarded[0] = "value";
        if (args.length > 1) {
            System.arraycopy(args, 1, forwarded, 1, args.length - 1);
        }
        if (rootstat != null && rootstat.getExecutor() != null) {
            return rootstat.getExecutor().onCommand(sender, rootstat, "rootstat", forwarded);
        }
        sender.sendMessage(plugin.colorize("&eRun &f/value &7for carried market value; &f/value <item> &7for lookup."));
        return true;
    }

    private boolean delegateMap(CommandSender sender) {
        if (!sender.hasPermission("rootmc.map") && !sender.hasPermission("rootstat.map") && !sender.hasPermission("roothelp.map")) {
            sender.sendMessage(plugin.colorize(plugin.msg("no-permission")));
            return true;
        }
        var rootstat = plugin.getCommand("rootstat");
        if (rootstat != null && rootstat.getExecutor() != null) {
            return rootstat.getExecutor().onCommand(sender, rootstat, "rootstat", new String[] { "map" });
        }
        var map = plugin.getServer().getPluginCommand("map");
        if (map != null && map.getExecutor() != null) {
            return map.getExecutor().onCommand(sender, map, "map", new String[0]);
        }
        sender.sendMessage(plugin.colorize("&eRun &f/map &7to open the live BlueMap."));
        return true;
    }

    private boolean requireLinkedPlayer(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return false;
        }
        try {
            CloudApiClient.LinkStatus status = plugin.cloud().linkStatus(player.getUniqueId().toString());
            if (!status.linked()) {
                sender.sendMessage(plugin.msg("ingame-not-linked"));
                return false;
            }
        } catch (Exception ex) {
            sender.sendMessage(plugin.colorize("&cCould not verify link: &f" + ex.getMessage()));
            return false;
        }
        return true;
    }

    private boolean handleWaypoint(CommandSender sender, String label, String[] args, int labelStart) {
        if (!sender.hasPermission("rootmc.waypoint")) {
            sender.sendMessage(plugin.colorize(plugin.msg("no-permission")));
            return true;
        }
        if (!requireLinkedPlayer(sender)) {
            return true;
        }
        Player player = (Player) sender;
        Location loc = player.getLocation();
        String waypointLabel = args.length > labelStart
                ? String.join(" ", java.util.Arrays.copyOfRange(args, labelStart, args.length))
                : "Waypoint";
        buffer.enqueue(IngameEventBuffer.waypoint(
                player.getUniqueId().toString(),
                player.getName(),
                loc.getWorld().getName(),
                loc.getWorld().getEnvironment().name().toLowerCase(Locale.ROOT),
                loc.getX(),
                loc.getY(),
                loc.getZ(),
                waypointLabel));
        plugin.flushIngameEventsAsync();
        sender.sendMessage(plugin.msg("waypoint-saved")
                .replace("{label}", waypointLabel)
                .replace("{x}", String.format("%.0f", loc.getX()))
                .replace("{y}", String.format("%.0f", loc.getY()))
                .replace("{z}", String.format("%.0f", loc.getZ())));
        return true;
    }

    private boolean handleNote(CommandSender sender, String label, String[] args, int textStart) {
        if (!sender.hasPermission("rootmc.note")) {
            sender.sendMessage(plugin.colorize(plugin.msg("no-permission")));
            return true;
        }
        if (!requireLinkedPlayer(sender)) {
            return true;
        }
        if (args.length <= textStart) {
            sender.sendMessage(plugin.colorize("&eUsage: /" + label + " <text>"));
            return true;
        }
        Player player = (Player) sender;
        Location loc = player.getLocation();
        String body = String.join(" ", java.util.Arrays.copyOfRange(args, textStart, args.length));
        buffer.enqueue(IngameEventBuffer.note(
                player.getUniqueId().toString(),
                player.getName(),
                loc.getWorld().getName(),
                loc.getWorld().getEnvironment().name().toLowerCase(Locale.ROOT),
                loc.getX(),
                loc.getY(),
                loc.getZ(),
                body));
        plugin.flushIngameEventsAsync();
        sender.sendMessage(plugin.msg("note-saved"));
        return true;
    }

    private boolean handleListNotes(CommandSender sender) {
        sender.sendMessage(plugin.colorize("&7Recent notes sync to the RootMC app on next cloud sync."));
        return true;
    }

    private boolean handleListWaypoints(CommandSender sender) {
        sender.sendMessage(plugin.colorize("&7Recent waypoints sync to the RootMC app on next cloud sync."));
        return true;
    }

    private boolean handleVault(CommandSender sender) {
        if (!sender.hasPermission("rootmc.vault")) {
            sender.sendMessage(plugin.colorize(plugin.msg("no-permission")));
            return true;
        }
        if (!requireLinkedPlayer(sender)) {
            return true;
        }
        Player player = (Player) sender;
        plugin.claimVaultAsync(player);
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        String name = command.getName().toLowerCase(Locale.ROOT);
        if (name.equals("rootmc") || name.equals("rmc")) {
            if (args.length == 1) {
                return ROOTMC_SUBCOMMANDS.stream()
                        .filter(s -> s.startsWith(args[0].toLowerCase(Locale.ROOT)))
                        .toList();
            }
        }
        return List.of();
    }
}
