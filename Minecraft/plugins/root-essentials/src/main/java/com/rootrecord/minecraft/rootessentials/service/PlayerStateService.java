package com.rootrecord.minecraft.rootessentials.service;

import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class PlayerStateService {

    public record TpaRequest(UUID requester, UUID target, boolean here, long createdAt) {}

    private final Map<UUID, Location> lastTeleport = new ConcurrentHashMap<>();
    private final Map<UUID, Location> deathBack = new ConcurrentHashMap<>();
    private final Map<UUID, TpaRequest> incoming = new ConcurrentHashMap<>();
    private final Map<UUID, UUID> lastMessagePartner = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> afk = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> vanished = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> socialSpy = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> god = new ConcurrentHashMap<>();
    private volatile boolean globalChatMuted;

    private final Map<UUID, Set<UUID>> ignores = new ConcurrentHashMap<>();
    private final Map<UUID, Long> playerTime = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> tpAuto = new ConcurrentHashMap<>();

    public void rememberBack(Player player) {
        lastTeleport.put(player.getUniqueId(), player.getLocation().clone());
    }

    public Location back(Player player) {
        return lastTeleport.get(player.getUniqueId());
    }

    public void rememberDeath(Player player) {
        deathBack.put(player.getUniqueId(), player.getLocation().clone());
    }

    public Location deathBack(Player player) {
        return deathBack.get(player.getUniqueId());
    }

    public void offerTpa(UUID target, TpaRequest request) {
        incoming.put(target, request);
    }

    public TpaRequest pendingTpa(UUID target) {
        return incoming.get(target);
    }

    public void clearTpa(UUID target) {
        incoming.remove(target);
    }

    public void setMessagePartner(UUID a, UUID b) {
        lastMessagePartner.put(a, b);
        lastMessagePartner.put(b, a);
    }

    public UUID messagePartner(UUID player) {
        return lastMessagePartner.get(player);
    }

    public boolean toggleAfk(UUID player) {
        boolean next = !afk.getOrDefault(player, false);
        afk.put(player, next);
        return next;
    }

    public boolean isAfk(UUID player) {
        return afk.getOrDefault(player, false);
    }

    public void clearAfk(UUID player) {
        afk.remove(player);
    }

    public boolean toggleVanish(UUID player) {
        boolean next = !vanished.getOrDefault(player, false);
        vanished.put(player, next);
        return next;
    }

    public boolean isVanished(UUID player) {
        return vanished.getOrDefault(player, false);
    }

    public boolean toggleSocialSpy(UUID player) {
        boolean next = !socialSpy.getOrDefault(player, false);
        socialSpy.put(player, next);
        return next;
    }

    public boolean isSocialSpy(UUID player) {
        return socialSpy.getOrDefault(player, false);
    }

    public boolean toggleGod(UUID player) {
        boolean next = !god.getOrDefault(player, false);
        god.put(player, next);
        return next;
    }

    public boolean isGod(UUID player) {
        return god.getOrDefault(player, false);
    }

    public boolean isGlobalChatMuted() {
        return globalChatMuted;
    }

    public void setGlobalChatMuted(boolean muted) {
        globalChatMuted = muted;
    }

    public void ignore(UUID player, UUID target) {
        ignores.computeIfAbsent(player, k -> ConcurrentHashMap.newKeySet()).add(target);
    }

    public void unignore(UUID player, UUID target) {
        Set<UUID> set = ignores.get(player);
        if (set != null) set.remove(target);
    }

    public boolean isIgnoring(UUID player, UUID target) {
        Set<UUID> set = ignores.get(player);
        return set != null && set.contains(target);
    }

    public Set<UUID> ignored(UUID player) {
        return ignores.getOrDefault(player, Set.of());
    }

    public void setPlayerTime(UUID player, Long ticks) {
        if (ticks == null) playerTime.remove(player);
        else playerTime.put(player, ticks);
    }

    public Long playerTime(UUID player) {
        return playerTime.get(player);
    }

    public boolean toggleTpAuto(UUID player) {
        boolean next = !tpAuto.getOrDefault(player, false);
        tpAuto.put(player, next);
        return next;
    }

    public boolean isTpAuto(UUID player) {
        return tpAuto.getOrDefault(player, false);
    }
}
