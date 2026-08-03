package com.rootrecord.minecraft.rootask.listener;

import com.rootrecord.minecraft.rootask.RootAskPlugin;
import com.rootrecord.minecraft.rootask.util.TopicGate;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

public final class GameQuestionChatListener implements Listener {

    private final RootAskPlugin plugin;
    private final Map<UUID, Long> lastProactiveAt = new ConcurrentHashMap<>();

    public GameQuestionChatListener(RootAskPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent event) {
        if (!plugin.askConfig().proactiveEnabled()) {
            return;
        }
        Player player = event.getPlayer();
        if (!player.hasPermission("rootask.use")) {
            return;
        }
        if (plugin.guideService().sessions().hasActiveSession(player.getUniqueId())) {
            return;
        }

        String message = stripColors(event.getMessage()).trim();
        if (message.length() < plugin.askConfig().proactiveMinChars()) {
            return;
        }
        if (!TopicGate.isRootMcQuestion(message)) {
            return;
        }
        for (String skip : plugin.askConfig().proactiveSkipPatterns()) {
            if (Pattern.compile(skip, Pattern.CASE_INSENSITIVE).matcher(message.toLowerCase(Locale.ROOT)).find()) {
                return;
            }
        }

        long now = System.currentTimeMillis();
        long cooldownMs = plugin.askConfig().proactiveCooldownMinutes() * 60_000L;
        long last = lastProactiveAt.getOrDefault(player.getUniqueId(), 0L);
        if (now - last < cooldownMs) {
            return;
        }
        lastProactiveAt.put(player.getUniqueId(), now);

        plugin.getServer().getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) {
                player.sendMessage(plugin.msg("proactive-offer"));
            }
        });
    }

    private static String stripColors(String text) {
        return text.replaceAll("§[0-9a-fk-or]", "").replaceAll("&[0-9a-fk-or]", "");
    }
}
