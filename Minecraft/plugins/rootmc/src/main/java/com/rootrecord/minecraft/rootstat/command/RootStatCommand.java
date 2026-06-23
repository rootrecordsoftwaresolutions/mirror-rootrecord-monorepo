package com.rootrecord.minecraft.rootstat.command;



import com.rootrecord.minecraft.common.RootMcMapUrls;
import com.rootrecord.minecraft.rootstat.RootStatBridge;

import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;

import com.rootrecord.minecraft.rootstat.economy.MarketValueReport;

import com.rootrecord.minecraft.rootstat.model.LinkStartResult;

import com.rootrecord.minecraft.rootstat.model.LinkedPlayer;

import com.rootrecord.minecraft.rootstat.util.RootStatUrls;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;

import org.bukkit.command.Command;

import org.bukkit.command.CommandExecutor;

import org.bukkit.command.CommandSender;

import org.bukkit.command.TabCompleter;

import org.bukkit.entity.Player;



import java.util.List;

import java.util.Locale;

import java.util.Optional;
import java.util.UUID;



public final class RootStatCommand implements CommandExecutor, TabCompleter {



    private final RootStatBridge bridge;
    private final ValueCommand valueCommand;

    public RootStatCommand(RootStatBridge bridge) {
        this.bridge = bridge;
        this.valueCommand = new ValueCommand(bridge);
    }



    @Override

    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {

        if (args.length == 0) {

            return handleStatus(sender);

        }



        String sub = args[0].toLowerCase(Locale.ROOT);

        return switch (sub) {

            case "link" -> handleLink(sender);

            case "status" -> handleStatus(sender);

            case "sync" -> handleSync(sender);

            case "reload" -> handleReload(sender);

            case "shops" -> handleShops(sender);

            case "map" -> handleMap(sender);

            case "value" -> handleValue(sender, args);

            default -> {

                sender.sendMessage(bridge.colorize("&eUsage: /" + label + " [link|status|map|shops|value|sync|reload]"));

                yield true;

            }

        };

    }



    private boolean handleLink(CommandSender sender) {

        if (!(sender instanceof Player player)) {

            sender.sendMessage("Players only.");

            return true;

        }

        if (!sender.hasPermission("rootstat.link")) {

            sender.sendMessage(bridge.colorize(bridge.msg("no-permission")));

            return true;

        }

        if (!bridge.config().hasServerCredentials()) {

            sender.sendMessage(bridge.colorize(bridge.msg("config-missing")));

            return true;

        }



        bridge.getPlugin().getServer().getScheduler().runTaskAsynchronously(bridge.getPlugin(), () -> {

            try {

                CloudApiClient.LinkStatus status = resolveLinkStatus(player);

                if (status.linked()) {

                    sendLinkedMessage(player, status.displayLabel());

                    sendStatsLink(player);

                    return;

                }



                LinkStartResult result = bridge.cloud().startLink(

                        player.getUniqueId().toString(), player.getName());

                String message = bridge.msg("link-started")

                        .replace("{code}", result.code())

                        .replace("{url}", result.verifyUrl());

                bridge.getPlugin().getServer().getScheduler().runTask(bridge.getPlugin(), () -> {
                    player.sendMessage(bridge.colorize(message));
                    sendStatsLink(player);
                });

            } catch (Exception ex) {

                bridge.getPlugin().getServer().getScheduler().runTask(bridge.getPlugin(), () -> player.sendMessage(bridge.colorize(

                        bridge.msg("sync-fail").replace("{error}", ex.getMessage()))));

            }

        });

        return true;

    }



    private boolean handleStatus(CommandSender sender) {

        if (!(sender instanceof Player player)) {

            sender.sendMessage("Players only.");

            return true;

        }

        if (!sender.hasPermission("rootstat.status")) {

            sender.sendMessage(bridge.colorize(bridge.msg("no-permission")));

            return true;

        }

        if (!bridge.config().hasServerCredentials()) {

            sender.sendMessage(bridge.colorize(bridge.msg("config-missing")));

            return true;

        }



        bridge.getPlugin().getServer().getScheduler().runTaskAsynchronously(bridge.getPlugin(), () -> {

            try {

                CloudApiClient.LinkStatus status = resolveLinkStatus(player);

                bridge.getPlugin().getServer().getScheduler().runTask(bridge.getPlugin(), () -> {

                    if (status.linked()) {

                        sendLinkedMessage(player, status.displayLabel());

                    } else {

                        player.sendMessage(bridge.colorize(bridge.msg("link-not")));

                    }

                    sendStatsLink(player);

                });

            } catch (Exception ex) {

                bridge.getPlugin().getServer().getScheduler().runTask(bridge.getPlugin(), () -> player.sendMessage(bridge.colorize(

                        bridge.msg("sync-fail").replace("{error}", ex.getMessage()))));

            }

        });

        return true;

    }



    private CloudApiClient.LinkStatus resolveLinkStatus(Player player) throws Exception {

        if (bridge.players() != null) {

            Optional<LinkedPlayer> local = bridge.players().findByUuid(player.getUniqueId());

            if (local.isPresent() && local.get().verified()) {

                LinkedPlayer p = local.get();

                return new CloudApiClient.LinkStatus(

                        true,

                        p.accountId(),

                        p.email(),

                        p.username());

            }

        }

        return bridge.cloud().linkStatus(player.getUniqueId().toString());

    }



    private void sendLinkedMessage(Player player, String label) {

        bridge.getPlugin().getServer().getScheduler().runTask(bridge.getPlugin(), () -> player.sendMessage(bridge.colorize(

                bridge.msg("link-already").replace("{account}", label))));

    }



    private boolean handleShops(CommandSender sender) {
        if (!bridge.config().hasServerCredentials()) {
            sender.sendMessage(bridge.colorize(bridge.msg("config-missing")));
            return true;
        }
        String serverId = bridge.config().serverId();
        UUID playerUuid = sender instanceof Player player ? player.getUniqueId() : null;
        String url = RootStatUrls.shopsUrl(serverId, bridge.config().shopsUrlBase(), playerUuid);
        sender.sendMessage(bridge.colorize(bridge.msg("shops-link").replace("{url}", url)));
        return true;
    }

    private boolean handleMap(CommandSender sender) {
        if (!sender.hasPermission("rootstat.map")) {
            sender.sendMessage(bridge.colorize(bridge.msg("no-permission")));
            return true;
        }
        RootMcMapUrls.sendOpenMapMessage(
                sender,
                bridge.getPlugin(),
                null,
                bridge.msg("map-header"),
                bridge::colorize);
        return true;
    }

    private boolean handleValue(CommandSender sender, String[] args) {
        if (args.length < 2) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage("Players only.");
                return true;
            }
            MarketValueReport.sendCarriedValue(player, bridge);
            return true;
        }
        String query = String.join(" ", java.util.Arrays.copyOfRange(args, 1, args.length)).trim();
        return valueCommand.onCommand(sender, null, "value", new String[] { query });
    }

    private void sendStatsLink(Player player) {
        String url = RootStatUrls.statsUrl(player.getUniqueId(), bridge.config().statsUrlBase());
        bridge.getPlugin().getServer().getScheduler().runTask(bridge.getPlugin(), () -> player.sendMessage(
                Component.text("[RootStat] ", NamedTextColor.DARK_GRAY)
                        .append(Component.text("Public stats: ", NamedTextColor.GRAY))
                        .append(Component.text(url, NamedTextColor.AQUA, TextDecoration.UNDERLINED)
                                .clickEvent(ClickEvent.openUrl(url)))));
    }



    private boolean handleSync(CommandSender sender) {

        if (!sender.hasPermission("rootstat.sync")) {

            sender.sendMessage(bridge.colorize(bridge.msg("no-permission")));

            return true;

        }

        if (bridge.players() == null) {

            sender.sendMessage(bridge.colorize(bridge.msg("mysql-disabled")));

            return true;

        }

        bridge.getPlugin().getServer().getScheduler().runTaskAsynchronously(bridge.getPlugin(), () -> {

            int count = bridge.syncTask().runSync(true);

            bridge.getPlugin().getServer().getScheduler().runTask(bridge.getPlugin(), () -> {

                if (count >= 0) {

                    sender.sendMessage(bridge.colorize(

                            bridge.msg("sync-done").replace("{count}", String.valueOf(count))));

                } else {

                    sender.sendMessage(bridge.colorize(bridge.msg("sync-fail").replace("{error}", "see console")));

                }

            });

        });

        return true;

    }



    private boolean handleReload(CommandSender sender) {

        if (!sender.hasPermission("rootstat.reload")) {

            sender.sendMessage(bridge.colorize(bridge.msg("no-permission")));

            return true;

        }

        bridge.reloadRootStatConfig();

        bridge.syncTask().start();

        sender.sendMessage(bridge.colorize("&aRootMC config reloaded."));

        return true;

    }



    @Override

    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {

        if (args.length == 1) {

            return List.of("link", "status", "map", "sync", "shops", "value", "reload").stream()

                    .filter(s -> s.startsWith(args[0].toLowerCase(Locale.ROOT)))

                    .toList();

        }

        return List.of();

    }

}


