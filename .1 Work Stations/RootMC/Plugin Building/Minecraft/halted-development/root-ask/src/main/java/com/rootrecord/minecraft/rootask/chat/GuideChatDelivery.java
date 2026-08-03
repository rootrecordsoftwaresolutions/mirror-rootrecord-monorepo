package com.rootrecord.minecraft.rootask.chat;

import com.rootrecord.minecraft.rootask.RootAskPlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class GuideChatDelivery {

    private static final Pattern URL_PATTERN = Pattern.compile("https?://\\S+");

    private GuideChatDelivery() {}

    public static void send(RootAskPlugin plugin, Player player, List<String> lines, String linkUrl) {
        List<String> chunks = new ArrayList<>();
        for (String line : lines) {
            if (line == null || line.isBlank()) {
                continue;
            }
            chunks.addAll(splitLongLine(line.trim()));
        }
        if (chunks.isEmpty()) {
            chunks.add("Check rootmc.net/wiki/player/ or ask staff on Discord.");
        }

        int delay = 0;
        int chunkDelay = plugin.askConfig().chunkDelayTicks();
        for (String chunk : chunks) {
            final String text = chunk;
            final boolean first = delay == 0;
            plugin.getServer().getScheduler().runTaskLater(
                    plugin,
                    () -> player.sendMessage(buildLine(plugin, text, first)),
                    delay);
            delay += chunkDelay;
        }

        if (linkUrl != null && !linkUrl.isBlank()) {
            final String url = linkUrl.trim();
            plugin.getServer().getScheduler().runTaskLater(
                    plugin,
                    () -> player.sendMessage(buildLink(plugin, url)),
                    delay);
        }
    }

    private static List<String> splitLongLine(String line) {
        if (line.length() <= 280) {
            return List.of(line);
        }
        List<String> out = new ArrayList<>();
        String remaining = line;
        while (remaining.length() > 280) {
            int cut = remaining.lastIndexOf(' ', 260);
            if (cut < 80) {
                cut = 260;
            }
            out.add(remaining.substring(0, cut).trim());
            remaining = remaining.substring(cut).trim();
        }
        if (!remaining.isEmpty()) {
            out.add(remaining);
        }
        return out;
    }

    private static Component buildLine(RootAskPlugin plugin, String text, boolean showPrefix) {
        Component body = textWithUrls(text);
        if (!showPrefix) {
            return body;
        }
        return Component.text()
                .append(Component.text("[Guide] ", NamedTextColor.GOLD, TextDecoration.BOLD))
                .append(body.colorIfAbsent(NamedTextColor.GRAY))
                .build();
    }

    private static Component buildLink(RootAskPlugin plugin, String url) {
        return Component.text("Open: ", NamedTextColor.GRAY)
                .append(Component.text(url, NamedTextColor.AQUA, TextDecoration.UNDERLINED)
                        .clickEvent(ClickEvent.openUrl(url)));
    }

    private static Component textWithUrls(String text) {
        Matcher m = URL_PATTERN.matcher(text);
        if (!m.find()) {
            return Component.text(text);
        }
        Component result = Component.empty();
        int last = 0;
        do {
            if (m.start() > last) {
                result = result.append(Component.text(text.substring(last, m.start())));
            }
            String url = m.group();
            result = result.append(Component.text(url, NamedTextColor.AQUA, TextDecoration.UNDERLINED)
                    .clickEvent(ClickEvent.openUrl(url)));
            last = m.end();
        } while (m.find());
        if (last < text.length()) {
            result = result.append(Component.text(text.substring(last)));
        }
        return result;
    }
}
