package com.rootrecord.minecraft.roothelp.command;

import com.rootrecord.minecraft.roothelp.RootHelpPlugin;
import com.rootrecord.minecraft.roothelp.cloud.HelpCloudClient;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public final class DiscordCommand implements CommandExecutor {

    private final RootHelpPlugin plugin;

    public DiscordCommand(RootHelpPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("roothelp.discord")) {
            sender.sendMessage(plugin.colorize("&cYou don't have permission."));
            return true;
        }

        var cfg = plugin.helpConfig();
        sender.sendMessage(plugin.msg("discord-header"));
        sender.sendMessage(plugin.colorize(plugin.rawMsg("discord-invite")));

        Component invite = Component.text()
                .append(Component.text("[" + cfg.discordGuildName() + "]", NamedTextColor.GREEN, TextDecoration.BOLD)
                        .clickEvent(ClickEvent.openUrl(cfg.discordInviteUrl()))
                        .hoverEvent(Component.text("Join " + cfg.discordGuildName(), NamedTextColor.GRAY)))
                .append(Component.text(" — ", NamedTextColor.GRAY))
                .append(Component.text(cfg.discordInviteUrl(), NamedTextColor.AQUA, TextDecoration.UNDERLINED)
                        .clickEvent(ClickEvent.openUrl(cfg.discordInviteUrl())))
                .build();
        sender.sendMessage(invite);

        if (!(sender instanceof Player player)) {
            sender.sendMessage(plugin.colorize("&7Sign in as a player to check your link status."));
            return true;
        }

        if (!plugin.cloud().hasCredentials()) {
            sender.sendMessage(plugin.msg("discord-no-cloud"));
            return true;
        }

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                HelpCloudClient.LinkProfile profile = plugin.cloud()
                        .fetchLinkProfile(player.getUniqueId().toString());
                plugin.getServer().getScheduler().runTask(plugin, () ->
                        sendProfile(player, profile, cfg.verifyUrl()));
            } catch (Exception ex) {
                plugin.getServer().getScheduler().runTask(plugin, () ->
                        sender.sendMessage(plugin.colorize(
                                plugin.rawMsg("discord-fetch-fail").replace("{error}", ex.getMessage()))));
            }
        });
        return true;
    }

    private void sendProfile(Player player, HelpCloudClient.LinkProfile profile, String verifyUrl) {
        String verify = profile.verifyUrl() != null && !profile.verifyUrl().isBlank()
                ? profile.verifyUrl()
                : verifyUrl;

        if (!profile.minecraftLinked()) {
            player.sendMessage(plugin.colorize(plugin.rawMsg("discord-mc-unlinked")));
            Component linkMc = Component.text()
                    .append(Component.text("[Link Minecraft]", NamedTextColor.GREEN, TextDecoration.BOLD)
                            .clickEvent(ClickEvent.runCommand("/link"))
                            .hoverEvent(Component.text("Run /link", NamedTextColor.GRAY)))
                    .build();
            player.sendMessage(linkMc);
            return;
        }

        player.sendMessage(plugin.colorize(
                plugin.rawMsg("discord-mc-linked")
                        .replace("{account}", profile.accountLabel() != null ? profile.accountLabel() : "RootRecord")));

        if (!profile.discordLinked()) {
            player.sendMessage(plugin.colorize(plugin.rawMsg("discord-discord-unlinked")));
            Component verifyBtn = Component.text()
                    .append(Component.text("[Open Verify Page]", NamedTextColor.AQUA, TextDecoration.BOLD)
                            .clickEvent(ClickEvent.openUrl(verify))
                            .hoverEvent(Component.text("Link Discord on the verify page", NamedTextColor.GRAY)))
                    .build();
            player.sendMessage(verifyBtn);
        } else {
            String user = profile.discordUsername() != null ? profile.discordUsername() : "Discord";
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("discord-discord-linked").replace("{user}", user)));
            player.sendMessage(plugin.colorize(plugin.rawMsg("discord-both-linked")));

            if (profile.discordProfileUrl() != null && !profile.discordProfileUrl().isBlank()) {
                Component discordProfile = Component.text()
                        .append(Component.text("Discord profile: ", NamedTextColor.GRAY))
                        .append(Component.text(user, NamedTextColor.LIGHT_PURPLE, TextDecoration.UNDERLINED)
                                .clickEvent(ClickEvent.openUrl(profile.discordProfileUrl())))
                        .build();
                player.sendMessage(discordProfile);
            }
        }

        if (profile.statsUrl() != null && !profile.statsUrl().isBlank()) {
            player.sendMessage(plugin.colorize(plugin.rawMsg("discord-stats")));
            Component stats = Component.text()
                    .append(Component.text(profile.statsUrl(), NamedTextColor.AQUA, TextDecoration.UNDERLINED)
                            .clickEvent(ClickEvent.openUrl(profile.statsUrl())))
                    .build();
            player.sendMessage(stats);
        }
    }
}
