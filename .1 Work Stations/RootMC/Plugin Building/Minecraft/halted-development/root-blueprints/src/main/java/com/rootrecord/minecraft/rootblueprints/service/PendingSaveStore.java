package com.rootrecord.minecraft.rootblueprints.service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class PendingSaveStore {

    public record PendingSave(
            String accountId,
            String townName,
            int plotX,
            int plotZ,
            String worldName,
            int chunkX,
            int chunkZ,
            int anchorX,
            int anchorY,
            int anchorZ,
            long expiresAtMs) {

        boolean expired() {
            return System.currentTimeMillis() > expiresAtMs;
        }
    }

    private final long timeoutMs;
    private final Map<UUID, PendingSave> pending = new ConcurrentHashMap<>();

    public PendingSaveStore(int timeoutSeconds) {
        this.timeoutMs = timeoutSeconds * 1000L;
    }

    public void put(UUID playerId, PendingSave save) {
        pending.put(playerId, save);
    }

    public PendingSave take(UUID playerId) {
        PendingSave save = pending.remove(playerId);
        if (save == null || save.expired()) {
            return null;
        }
        return save;
    }

    public PendingSave peek(UUID playerId) {
        PendingSave save = pending.get(playerId);
        if (save == null) {
            return null;
        }
        if (save.expired()) {
            pending.remove(playerId);
            return null;
        }
        return save;
    }

    public long timeoutMs() {
        return timeoutMs;
    }

    public int timeoutSeconds() {
        return (int) (timeoutMs / 1000L);
    }
}
