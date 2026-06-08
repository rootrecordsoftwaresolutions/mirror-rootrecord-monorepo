package com.rootrecord.minecraft.rootstat.command;



import com.rootrecord.minecraft.rootstat.RootStatBridge;

import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;

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



public final class RootStatCommand implements CommandExecutor, TabCompleter {



    private final RootStatBridge bridge;

    public RootStatCommand(RootStatBridge bridge) {
        this.bridge = bridge;
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

            default -> {

                sender.sendMessage(bridge.colorize("&eUsage: /rootstat [link|status|sync|reload]"));

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

        sender.sendMessage(bridge.colorize("&aRootStat config reloaded."));

        return true;

    }



    @Override

    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {

        if (args.length == 1) {

            return List.of("link", "status", "sync", "reload").stream()

                    .filter(s -> s.startsWith(args[0].toLowerCase(Locale.ROOT)))

                    .toList();

        }

        return List.of();

    }

}


