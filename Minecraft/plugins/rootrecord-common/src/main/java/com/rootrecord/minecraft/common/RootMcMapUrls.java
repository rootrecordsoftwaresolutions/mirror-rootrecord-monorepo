package com.rootrecord.minecraft.common;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.World;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.io.File;

/** RootMC BlueMap public URL — proxied at {@link #DEFAULT_MAP_URL}. */
public final class RootMcMapUrls {

    public static final String DEFAULT_MAP_URL = "https://map.rootmc.net";

    private RootMcMapUrls() {}

    public static String resolveBaseUrl(Plugin plugin) {
        return resolveBaseUrl(plugin, null);
    }

    /** {@code override} wins when non-blank (e.g. roothelp.yml {@code map.base-url}). */
    public static String resolveBaseUrl(Plugin plugin, String override) {
        if (override != null && !override.isBlank()) {
            return trimTrailingSlash(override.trim());
        }
        File rootmc = RootRecordFolders.configFile(plugin, RootRecordFolders.ROOTMC_CONFIG);
        if (rootmc.isFile()) {
            YamlConfiguration yaml = YamlConfiguration.loadConfiguration(rootmc);
            String fromRootMc = yaml.getString("server.map-url", "");
            if (fromRootMc != null && !fromRootMc.isBlank()) {
                return trimTrailingSlash(fromRootMc.trim());
            }
        }
        return DEFAULT_MAP_URL;
    }

    /** BlueMap webapp anchor: {@code mapId:x:y:z}. */
    public static String withPlayerAnchor(String baseUrl, Player player) {
        var loc = player.getLocation();
        String mapId = bluemapMapId(player);
        String anchor = mapId + ":"
                + loc.getBlockX() + ":"
                + loc.getBlockY() + ":"
                + loc.getBlockZ();
        return baseUrl + "#" + anchor;
    }

    static String bluemapMapId(Player player) {
        World world = player.getWorld();
        if (world == null) {
            return "world";
        }
        return switch (world.getEnvironment()) {
            case NETHER -> "the_nether";
            case THE_END -> "the_end";
            case NORMAL -> "world";
            default -> {
                var key = world.getKey();
                String dim = key != null ? key.getKey() : "";
                if (!dim.isBlank() && !"overworld".equals(dim)) {
                    yield dim;
                }
                yield "world";
            }
        };
    }

    public static void sendOpenMapMessage(
            CommandSender sender,
            Plugin plugin,
            String overrideBaseUrl,
            String headerLegacy,
            java.util.function.Function<String, String> colorize) {
        String base = resolveBaseUrl(plugin, overrideBaseUrl);
        String url = sender instanceof Player player ? withPlayerAnchor(base, player) : base;

        if (headerLegacy != null && !headerLegacy.isBlank()) {
            sender.sendMessage(colorize.apply(headerLegacy));
        }
        Component link = Component.text()
                .append(Component.text("[Open BlueMap]", NamedTextColor.GREEN, TextDecoration.BOLD)
                        .clickEvent(ClickEvent.openUrl(url))
                        .hoverEvent(Component.text(url, NamedTextColor.GRAY)))
                .append(Component.text(" — ", NamedTextColor.GRAY))
                .append(Component.text(url, NamedTextColor.AQUA, TextDecoration.UNDERLINED)
                        .clickEvent(ClickEvent.openUrl(url)))
                .build();
        sender.sendMessage(link);
    }

    private static String trimTrailingSlash(String url) {
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        return url;
    }
}
