package com.rootrecord.minecraft.rootavacore;

import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

public final class AvaCommand implements CommandExecutor, TabCompleter {

    private final RootAvaCorePlugin plugin;

    public AvaCommand(RootAvaCorePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length > 0 && "reload".equalsIgnoreCase(args[0])) {
            if (!sender.hasPermission("rootavacore.admin")) {
                sender.sendMessage(plugin.colorize(plugin.config().noPermission()));
                return true;
            }
            plugin.reloadAll();
            sender.sendMessage(plugin.colorize(plugin.config().reloaded()));
            return true;
        }

        if (!sender.hasPermission("rootavacore.use")) {
            sender.sendMessage(plugin.colorize(plugin.config().noPermission()));
            return true;
        }
        if (!plugin.config().enabled()) {
            sender.sendMessage(plugin.colorize(plugin.config().disabled()));
            return true;
        }

        if (args.length > 0 && "presence".equalsIgnoreCase(args[0])) {
            return handlePresence(sender, args);
        }

        if (args.length > 0 && "army".equalsIgnoreCase(args[0])) {
            return sendArmy(sender, args.length > 1 ? args[1] : null);
        }

        if (args.length > 0 && "tip".equalsIgnoreCase(args[0])) {
            AvaConfig cfg = plugin.config();
            sender.sendMessage(plugin.colorize(cfg.prefix() + cfg.tipHeader()));
            sender.sendMessage(plugin.colorize(cfg.prefix() + "&f" + cfg.randomTip()));
            return true;
        }

        if (args.length > 0 && "pulse".equalsIgnoreCase(args[0])) {
            AvaConfig cfg = plugin.config();
            int online = Bukkit.getOnlinePlayers().size();
            String tpsText = formatTps();
            sender.sendMessage(plugin.colorize(cfg.prefix() + cfg.pulseHeader()));
            sender.sendMessage(plugin.colorize(
                    cfg.prefix() + "&7" + online + " online &8· &7" + tpsText + " TPS &8· &dAva's Army soft-online"));
            sender.sendMessage(plugin.colorize(cfg.prefix() + "&f" + cfg.randomPulse()));
            sender.sendMessage(plugin.colorize(cfg.prefix() + "&8also: &7/ava army &8· &7/ava tip &8· &7/ava rollcall"));
            return true;
        }

        if (args.length > 0 && ("rollcall".equalsIgnoreCase(args[0]) || "roll".equalsIgnoreCase(args[0]))) {
            return sendRollcall(sender);
        }

        if (args.length > 0 && ("help".equalsIgnoreCase(args[0]) || "?".equals(args[0]))) {
            sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&7/ava &8— &fstatus"));
            sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&7/ava army &8— &fAva's Army departments"));
            sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&7/ava army <dept> &8— &fone department"));
            sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&7/ava tip &8— &fVoice tip"));
            sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&7/ava pulse &8— &fWatch heartbeat"));
            sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&7/ava rollcall &8— &fdept standing"));
            sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&7/ava presence &8— &fin-world body status"));
            sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&7/solar &8— &fhost power + weather"));
            return true;
        }

        int online = Bukkit.getOnlinePlayers().size();
        String tpsText = formatTps();
        String line = plugin.config().statusLine()
                .replace("{version}", plugin.getDescription().getVersion())
                .replace("{online}", String.valueOf(online))
                .replace("{tps}", tpsText);
        sender.sendMessage(plugin.colorize(plugin.config().prefix() + line));
        sender.sendMessage(plugin.colorize(
                plugin.config().prefix() + "&8also: &7/ava army &8· &7/ava tip &8· &7/ava pulse &8· &7/ava rollcall &8· &7/ava presence"));
        return true;
    }

    private boolean handlePresence(CommandSender sender, String[] args) {
        AvaConfig.PresenceConfig cfg = plugin.config().presence();
        String sub = args.length > 1 ? args[1].toLowerCase(Locale.ROOT) : "status";

        if ("spawn".equals(sub) || "despawn".equals(sub) || "here".equals(sub)) {
            if (!sender.hasPermission("rootavacore.admin")) {
                sender.sendMessage(plugin.colorize(plugin.config().noPermission()));
                return true;
            }
        }

        if ("despawn".equals(sub)) {
            plugin.presence().despawn();
            sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&7Presence despawned."));
            return true;
        }

        if ("spawn".equals(sub)) {
            if (!cfg.enabled()) {
                sender.sendMessage(plugin.colorize(
                        plugin.config().prefix() + "&cpresence.enabled is false in root-ava-core.yml"));
                return true;
            }
            plugin.presence().startIfEnabled();
            sender.sendMessage(plugin.colorize(plugin.config().prefix()
                    + (plugin.presence().isSpawned() ? "&aPresence spawned." : "&cSpawn failed — check console.")));
            return true;
        }

        if ("here".equals(sub)) {
            if (!(sender instanceof org.bukkit.entity.Player player)) {
                sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&cPlayers only."));
                return true;
            }
            if (!cfg.enabled()) {
                sender.sendMessage(plugin.colorize(
                        plugin.config().prefix() + "&cpresence.enabled is false in root-ava-core.yml"));
                return true;
            }
            boolean ok = plugin.presence().spawnHere(player.getLocation());
            sender.sendMessage(plugin.colorize(plugin.config().prefix()
                    + (ok ? "&aPresence anchored here." : "&cCould not spawn here.")));
            return true;
        }

        // status
        sender.sendMessage(plugin.colorize(plugin.config().prefix() + "&dPresence &8· &7Phase 1 shell"));
        sender.sendMessage(plugin.colorize(plugin.config().prefix()
                + "&7enabled: &f" + cfg.enabled()
                + " &8· &7stack: &f" + cfg.stack()
                + " &8· &7active: &f" + plugin.presence().activeStack()));
        sender.sendMessage(plugin.colorize(plugin.config().prefix()
                + "&7spawned: &f" + plugin.presence().isSpawned()
                + " &8· &7speak: &f" + cfg.speakPolicy()
                + " &8· &7name: " + cfg.displayName()));
        sender.sendMessage(plugin.colorize(
                plugin.config().prefix() + "&7skin: &f" + cfg.skinName()
                        + " &8· &7wander r=&f" + cfg.wanderRadius()));
        if (sender.hasPermission("rootavacore.admin")) {
            sender.sendMessage(plugin.colorize(plugin.config().prefix()
                    + "&8admin: &7/ava presence spawn|despawn|here"));
        }
        return true;
    }

    private boolean sendRollcall(CommandSender sender) {
        AvaConfig cfg = plugin.config();
        int online = Bukkit.getOnlinePlayers().size();
        String tpsText = formatTps();
        sender.sendMessage(plugin.colorize(cfg.prefix() + cfg.rollcallHeader()));
        sender.sendMessage(plugin.colorize(
                cfg.prefix() + "&7" + online + " online &8· &7" + tpsText + " TPS &8· &fCommand standing"));
        for (AvaConfig.ArmyDept d : cfg.armyDepartments().values()) {
            sender.sendMessage(plugin.colorize(
                    cfg.prefix() + "&d▸ &f" + d.name() + " &8— &7" + cfg.rollcallLine(d.id())));
        }
        sender.sendMessage(plugin.colorize(cfg.prefix() + cfg.rollcallFooter()));
        return true;
    }

    private boolean sendArmy(CommandSender sender, String deptArg) {
        AvaConfig cfg = plugin.config();
        if (deptArg != null && !deptArg.isBlank()) {
            AvaConfig.ArmyDept dept = cfg.armyDept(deptArg);
            if (dept == null) {
                sender.sendMessage(plugin.colorize(cfg.prefix() + cfg.armyUnknown()));
                return true;
            }
            sender.sendMessage(plugin.colorize(cfg.prefix() + "&d" + dept.name()));
            sender.sendMessage(plugin.colorize(cfg.prefix() + "&7" + dept.blurb()));
            sender.sendMessage(plugin.colorize(cfg.prefix() + "&8id: &f" + dept.id() + " &8· tag &farmy:" + dept.id()));
            return true;
        }

        sender.sendMessage(plugin.colorize(cfg.prefix() + cfg.armyHeader()));
        sender.sendMessage(plugin.colorize(cfg.prefix() + "&7Ava Ivy &8— &fCommand"));
        for (AvaConfig.ArmyDept d : cfg.armyDepartments().values()) {
            sender.sendMessage(plugin.colorize(
                    cfg.prefix() + "&d▸ &f" + d.name() + " &8— &7" + d.blurb()));
        }
        sender.sendMessage(plugin.colorize(cfg.prefix() + cfg.armyFooter()));
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            String partial = args[0].toLowerCase(Locale.ROOT);
            List<String> opts = new ArrayList<>();
            if ("army".startsWith(partial)) opts.add("army");
            if ("tip".startsWith(partial)) opts.add("tip");
            if ("pulse".startsWith(partial)) opts.add("pulse");
            if ("rollcall".startsWith(partial)) opts.add("rollcall");
            if ("presence".startsWith(partial)) opts.add("presence");
            if ("help".startsWith(partial)) opts.add("help");
            if (sender.hasPermission("rootavacore.admin") && "reload".startsWith(partial)) {
                opts.add("reload");
            }
            return opts;
        }
        if (args.length == 2 && "army".equalsIgnoreCase(args[0])) {
            String partial = args[1].toLowerCase(Locale.ROOT);
            return plugin.config().armyTabIds().stream()
                    .filter(id -> id.startsWith(partial))
                    .collect(Collectors.toList());
        }
        if (args.length == 2 && "presence".equalsIgnoreCase(args[0])) {
            String partial = args[1].toLowerCase(Locale.ROOT);
            List<String> opts = new ArrayList<>();
            if ("status".startsWith(partial)) opts.add("status");
            if (sender.hasPermission("rootavacore.admin")) {
                if ("spawn".startsWith(partial)) opts.add("spawn");
                if ("despawn".startsWith(partial)) opts.add("despawn");
                if ("here".startsWith(partial)) opts.add("here");
            }
            return opts;
        }
        return Collections.emptyList();
    }

    private static String formatTps() {
        try {
            double[] tps = Bukkit.getTPS();
            if (tps != null && tps.length > 0) {
                double v = Math.min(20.0, tps[0]);
                return String.format(Locale.US, "%.1f", v);
            }
        } catch (Throwable ignored) {
            // Soft signal only — TPS may be unavailable on non-Paper forks.
        }
        return "n/a";
    }
}
