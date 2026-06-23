package com.rootrecord.minecraft.rootstat.listener;

import com.rootrecord.minecraft.rootstat.RootStatBridge;
import com.rootrecord.minecraft.rootstat.model.LinkedPlayer;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Tracks playtime sessions, cloud sync on join, and linked-player cache refresh. */
public final class PlayerSessionListener implements Listener {

    private final RootStatBridge bridge;
    private final Map<UUID, Long> sessionStartMs = new ConcurrentHashMap<>();

    public PlayerSessionListener(RootStatBridge bridge) {
        this.bridge = bridge;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();
        sessionStartMs.put(uuid, System.currentTimeMillis());

        bridge.getPlugin().getServer().getScheduler().runTaskAsynchronously(bridge.getPlugin(), () -> {
            try {
                if (bridge.playtime() != null) {
                    bridge.playtime().recordLogin(uuid, event.getPlayer().getName());
                }
            } catch (Exception ignored) {
                // non-fatal
            }

            bridge.syncTask().runSyncSafe();

            try {
                var status = bridge.cloud().linkStatus(uuid.toString());
                if (status.linked() && bridge.players() != null) {
                    bridge.players().upsert(new LinkedPlayer(
                            uuid.toString(),
                            event.getPlayer().getName(),
                            status.accountId(),
                            null,
                            null,
                            java.time.Instant.now().toString()));
                }
            } catch (Exception ignored) {
                // join should not fail on cloud errors
            }
        });
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();
        Long started = sessionStartMs.remove(uuid);
        if (started == null || bridge.playtime() == null) {
            return;
        }
        long seconds = Math.max(0L, (System.currentTimeMillis() - started) / 1000L);
        if (seconds <= 0) {
            return;
        }
        bridge.getPlugin().getServer().getScheduler().runTaskAsynchronously(bridge.getPlugin(), () -> {
            try {
                bridge.playtime().addSession(uuid, seconds);
            } catch (Exception ignored) {
                // non-fatal
            }
        });
    }
}
