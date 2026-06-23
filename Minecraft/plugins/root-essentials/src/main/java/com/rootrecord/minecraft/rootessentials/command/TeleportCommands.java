package com.rootrecord.minecraft.rootessentials.command;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.service.PlayerStateService;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public final class TeleportCommands {

    private TeleportCommands() {}

    public static final class Tpa implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Tpa(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "tpa")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            if (args.length < 1) { player.sendMessage(plugin.colorize("&eUsage: /tpa <player>")); return true; }
            Player target = Bukkit.getPlayerExact(args[0]);
            if (target == null) { player.sendMessage(plugin.msg("player-not-found").replace("{player}", args[0])); return true; }
            plugin.playerState().offerTpa(target.getUniqueId(), new PlayerStateService.TpaRequest(player.getUniqueId(), target.getUniqueId(), false, System.currentTimeMillis()));
            if (plugin.playerState().isTpAuto(target.getUniqueId())) {
                return new TpAccept(plugin).onCommand(target, command, label, args);
            }
            target.sendMessage(tpaPrompt(
                    player.getName() + " wants to teleport to you.",
                    "Accept teleport request",
                    "Deny teleport request"));
            player.sendMessage(plugin.colorize("&7TPA sent to &f" + target.getName()));
            return true;
        }
    }

    public static final class TpaHere implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public TpaHere(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "tpahere")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            if (args.length < 1) { player.sendMessage(plugin.colorize("&eUsage: /tpahere <player>")); return true; }
            Player target = Bukkit.getPlayerExact(args[0]);
            if (target == null) { player.sendMessage(plugin.msg("player-not-found").replace("{player}", args[0])); return true; }
            plugin.playerState().offerTpa(target.getUniqueId(), new PlayerStateService.TpaRequest(player.getUniqueId(), target.getUniqueId(), true, System.currentTimeMillis()));
            if (plugin.playerState().isTpAuto(target.getUniqueId())) {
                return new TpAccept(plugin).onCommand(target, command, label, args);
            }
            target.sendMessage(tpaPrompt(
                    player.getName() + " wants you to teleport to them.",
                    "Accept teleport request",
                    "Deny teleport request"));
            player.sendMessage(plugin.colorize("&7TPAHERE sent to &f" + target.getName()));
            return true;
        }
    }

    public static final class TpAccept implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public TpAccept(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "tpaccept")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            var req = plugin.playerState().pendingTpa(player.getUniqueId());
            if (req == null) { player.sendMessage(plugin.colorize("&eNo pending teleport request.")); return true; }
            Player requester = Bukkit.getPlayer(req.requester());
            if (requester == null) { plugin.playerState().clearTpa(player.getUniqueId()); player.sendMessage(plugin.msg("player-not-found").replace("{player}", "requester")); return true; }
            plugin.playerState().clearTpa(player.getUniqueId());
            if (req.here()) {
                plugin.playerState().rememberBack(player);
                plugin.teleportPlayer(player, () -> requester.getLocation(), () -> {
                    player.sendMessage(plugin.colorize("&aTeleport accepted."));
                    requester.sendMessage(plugin.colorize("&aTeleport accepted."));
                });
            } else {
                plugin.playerState().rememberBack(requester);
                plugin.teleportPlayer(requester, () -> player.getLocation(), () -> {
                    player.sendMessage(plugin.colorize("&aTeleport accepted."));
                    requester.sendMessage(plugin.colorize("&aTeleport accepted."));
                });
            }
            return true;
        }
    }

    public static final class TpDeny implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public TpDeny(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "tpdeny")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            if (plugin.playerState().pendingTpa(player.getUniqueId()) == null) {
                player.sendMessage(plugin.colorize("&eNo pending teleport request."));
                return true;
            }
            plugin.playerState().clearTpa(player.getUniqueId());
            player.sendMessage(plugin.colorize("&cTeleport request denied."));
            return true;
        }
    }

    public static final class Back implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public Back(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "back")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            var loc = plugin.playerState().back(player);
            if (loc == null && Permissions.has(player, "back.ondeath")) {
                loc = plugin.playerState().deathBack(player);
            }
            if (loc == null) { player.sendMessage(plugin.colorize("&eNo back location.")); return true; }
            plugin.teleportPlayer(player, loc, () -> player.sendMessage(plugin.colorize("&aTeleported back.")));
            return true;
        }
    }

    public static final class TpAuto implements CommandExecutor {
        private final RootEssentialsPlugin plugin;
        public TpAuto(RootEssentialsPlugin plugin) { this.plugin = plugin; }
        @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
            if (!(sender instanceof Player player)) { sender.sendMessage("Players only."); return true; }
            if (!Permissions.has(player, "tpauto")) { player.sendMessage(plugin.msg("no-permission")); return true; }
            boolean on = plugin.playerState().toggleTpAuto(player.getUniqueId());
            player.sendMessage(plugin.colorize(on ? "&aTPA auto-accept enabled." : "&7TPA auto-accept disabled."));
            return true;
        }
    }

    private static Component tpaPrompt(String lead, String acceptHover, String denyHover) {
        Component accept = Component.text("[Accept]", NamedTextColor.GREEN, TextDecoration.BOLD)
                .clickEvent(ClickEvent.runCommand("/tpaccept"))
                .hoverEvent(HoverEvent.showText(Component.text(acceptHover, NamedTextColor.GRAY)));
        Component deny = Component.text("[Deny]", NamedTextColor.RED, TextDecoration.BOLD)
                .clickEvent(ClickEvent.runCommand("/tpdeny"))
                .hoverEvent(HoverEvent.showText(Component.text(denyHover, NamedTextColor.GRAY)));
        return Component.text(lead + " ", NamedTextColor.GRAY)
                .append(accept)
                .append(Component.text(" ", NamedTextColor.GRAY))
                .append(deny);
    }
}
