package com.rootrecord.minecraft.rootmc.discord;

import com.rootrecord.minecraft.rootmc.RootMcPlugin;
import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.HandlerList;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.scheduler.BukkitTask;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.logging.Level;
import java.util.regex.Pattern;

/** Relays global in-game chat, join/leave, and deaths ↔ RootMC Discord via the rootmc API. */
public final class DiscordChatBridge implements Listener {

    private static final Pattern COLOR_CODES = Pattern.compile("(?i)[§&][0-9a-fk-or]");
    private static final LegacyComponentSerializer LEGACY = LegacyComponentSerializer.legacySection();

    private final RootMcPlugin plugin;
    private final DiscordChatConfig config;
    private final ConcurrentLinkedQueue<OutboundChat> outbound = new ConcurrentLinkedQueue<>();
    private final File stateFile;

    private BukkitTask pollTask;
    private BukkitTask flushTask;
    private String lastDiscordMessageId = "";

    public DiscordChatBridge(RootMcPlugin plugin, DiscordChatConfig config) {
        this.plugin = plugin;
        this.config = config;
        this.stateFile = new File(RootRecordFolders.dir(plugin), "discord-chat-state.yml");
    }

    public void start() {
        stop();
        loadState();
        Bukkit.getPluginManager().registerEvents(this, plugin);
        long pollTicks = Math.max(20L, config.pollIntervalSeconds() * 20L);
        pollTask = plugin.getServer().getScheduler().runTaskTimerAsynchronously(
                plugin, this::pollDiscordSafe, pollTicks, pollTicks);
        flushTask = plugin.getServer().getScheduler().runTaskTimerAsynchronously(
                plugin, this::flushOutboundSafe, 10L, 10L);
        plugin.getLogger().info("Discord chat bridge enabled (poll every "
                + config.pollIntervalSeconds() + "s, channel via API).");
    }

    public void stop() {
        HandlerList.unregisterAll(this);
        if (pollTask != null) {
            pollTask.cancel();
            pollTask = null;
        }
        if (flushTask != null) {
            flushTask.cancel();
            flushTask = null;
        }
        flushOutboundSafe();
        saveState();
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        if (!config.enabled() || !config.relayChat()) {
            return;
        }
        String message = stripColors(serialize(event.message()));
        if (message.isBlank() || message.startsWith("/")) {
            return;
        }
        Player player = event.getPlayer();
        enqueue(player.getName(), player.getUniqueId().toString(), message, "chat");
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        if (!config.enabled() || !config.relayJoin()) {
            return;
        }
        Player player = event.getPlayer();
        enqueue(player.getName(), player.getUniqueId().toString(), "joined the server", "join");
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        if (!config.enabled() || !config.relayLeave()) {
            return;
        }
        Player player = event.getPlayer();
        String detail = event.quitMessage() == null
                ? "left the server"
                : stripColors(serialize(event.quitMessage()));
        if (detail.isBlank()) {
            detail = "left the server";
        }
        enqueue(player.getName(), player.getUniqueId().toString(), detail, "leave");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDeath(PlayerDeathEvent event) {
        if (!config.enabled() || !config.relayDeath()) {
            return;
        }
        Player player = event.getEntity();
        String detail = stripColors(serialize(event.deathMessage()));
        if (detail.isBlank()) {
            detail = "died";
        }
        enqueue(player.getName(), player.getUniqueId().toString(), detail, "death");
    }

    private void enqueue(String username, String uuid, String message, String kind) {
        outbound.add(new OutboundChat(
                username,
                uuid,
                message,
                kind,
                java.time.Instant.now().toString()));
    }

    private volatile long relayBackoffUntilMs = 0;
    private static final long RELAY_BACKOFF_MS = 60_000L;

    private void flushOutboundSafe() {
        if (!plugin.config().hasServerCredentials()) {
            return;
        }
        if (System.currentTimeMillis() < relayBackoffUntilMs) {
            return;
        }
        List<OutboundChat> batch = drainOutbound();
        if (batch.isEmpty()) {
            return;
        }
        try {
            plugin.cloud().relayIngameChat(batch.stream()
                    .map(m -> new CloudApiClient.ChatRelayMessage(
                            m.username(), m.uuid(), m.message(), m.kind(), m.createdAt()))
                    .toList());
            relayBackoffUntilMs = 0;
        } catch (Exception ex) {
            String msg = ex.getMessage() == null ? "" : ex.getMessage();
            if (msg.contains("404") || msg.contains("503")) {
                relayBackoffUntilMs = System.currentTimeMillis() + RELAY_BACKOFF_MS;
            }
            plugin.getLogger().log(Level.WARNING, "Discord chat relay failed: " + msg);
            batch.forEach(outbound::add);
        }
    }

    private List<OutboundChat> drainOutbound() {
        List<OutboundChat> batch = new ArrayList<>();
        OutboundChat next;
        while ((next = outbound.poll()) != null) {
            batch.add(next);
            if (batch.size() >= 20) {
                break;
            }
        }
        return batch;
    }

    private void pollDiscordSafe() {
        if (!config.enabled() || !plugin.config().hasServerCredentials()) {
            return;
        }
        try {
            boolean seeding = lastDiscordMessageId == null || lastDiscordMessageId.isBlank();
            CloudApiClient.DiscordChatPoll poll = plugin.cloud().pollDiscordChat(lastDiscordMessageId);
            if (poll.newestId() != null && !poll.newestId().isBlank()) {
                lastDiscordMessageId = poll.newestId();
            }
            if (seeding) {
                saveState();
                return;
            }
            if (poll.messages().isEmpty()) {
                saveState();
                return;
            }
            for (CloudApiClient.DiscordInboundMessage msg : poll.messages()) {
                if (msg.id() != null && !msg.id().isBlank()) {
                    lastDiscordMessageId = msg.id();
                }
                String line = formatInbound(msg.username(), msg.message());
                plugin.getServer().getScheduler().runTask(plugin, () ->
                        Bukkit.broadcastMessage(plugin.colorize(line)));
            }
            saveState();
        } catch (Exception ex) {
            plugin.getLogger().log(Level.WARNING, "Discord chat poll failed: " + ex.getMessage());
        }
    }

    private String formatInbound(String user, String message) {
        return config.inboundFormat()
                .replace("{user}", user == null ? "Discord" : user)
                .replace("{message}", message == null ? "" : message);
    }

    private static String serialize(Component component) {
        if (component == null) {
            return "";
        }
        return LEGACY.serialize(component);
    }

    private static String stripColors(String value) {
        if (value == null) {
            return "";
        }
        return COLOR_CODES.matcher(value).replaceAll("").trim();
    }

    private void loadState() {
        if (!stateFile.isFile()) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(stateFile);
        lastDiscordMessageId = yaml.getString("last-discord-message-id", "");
    }

    private void saveState() {
        try {
            File parent = stateFile.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                return;
            }
            YamlConfiguration yaml = new YamlConfiguration();
            yaml.set("last-discord-message-id", lastDiscordMessageId);
            yaml.save(stateFile);
        } catch (IOException ex) {
            plugin.getLogger().log(Level.FINE, "Could not save discord chat state", ex);
        }
    }

    private record OutboundChat(String username, String uuid, String message, String kind, String createdAt) {}
}
