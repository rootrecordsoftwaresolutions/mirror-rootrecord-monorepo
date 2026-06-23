package com.rootrecord.minecraft.rootrewards.service;

import com.rootrecord.minecraft.rootrewards.RootRewardsPlugin;
import com.rootrecord.minecraft.rootrewards.data.RewardsStore;
import com.rootrecord.minecraft.rootrewards.economy.RewardsEconomy;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.logging.Level;

public final class VoteRewardService {

    private final RootRewardsPlugin plugin;
    private final RewardsStore store;
    private final RewardsEconomy economy;

    public VoteRewardService(RootRewardsPlugin plugin, RewardsStore store, RewardsEconomy economy) {
        this.plugin = plugin;
        this.store = store;
        this.economy = economy;
    }

    public void handleVote(String username, String service) {
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                OfflinePlayer lookedUp = Bukkit.getOfflinePlayerIfCached(username);
                if (lookedUp == null || !lookedUp.hasPlayedBefore()) {
                    lookedUp = Bukkit.getOfflinePlayer(username);
                }
                final OfflinePlayer player = lookedUp;
                if (!player.hasPlayedBefore()) {
                    plugin.getLogger().info("Vote from unknown player: " + username);
                    return;
                }
                if (player.isOnline() && !player.getPlayer().hasPermission("rootrewards.vote")) {
                    return;
                }

                String svc = service == null || service.isBlank() ? "default" : service.toLowerCase(Locale.ROOT);
                var last = store.lastVoteAt(player.getUniqueId(), svc);
                int cooldownHours = plugin.rewardsConfig().voteCooldownHours();
                if (last.isPresent()) {
                    Instant eligible = last.get().plus(Duration.ofHours(cooldownHours));
                    if (Instant.now().isBefore(eligible)) {
                        if (player.isOnline()) {
                            Duration remaining = Duration.between(Instant.now(), eligible);
                            notifyCooldown(player.getPlayer(), svc, formatDuration(remaining));
                        }
                        return;
                    }
                }

                double gold = plugin.rewardsConfig().rollVoteGold();
                economy.deposit(player.getUniqueId(), gold);
                store.recordVote(player.getUniqueId(), svc);

                if (player.isOnline()) {
                    String msg = plugin.rawMsg("vote-grant")
                            .replace("{service}", svc)
                            .replace("{gold}", formatGold(gold));
                    Bukkit.getScheduler().runTask(plugin, () -> {
                        if (player.isOnline()) {
                            player.getPlayer().sendMessage(plugin.msg(msg));
                        }
                    });
                }
                plugin.getLogger().info("Vote reward +" + gold + " G to " + username + " (" + svc + ")");
            } catch (Exception ex) {
                plugin.getLogger().log(Level.WARNING, "Vote reward failed for " + username, ex);
            }
        });
    }

    private void notifyCooldown(org.bukkit.entity.Player player, String service, String remaining) {
        String msg = plugin.rawMsg("vote-cooldown")
                .replace("{service}", service)
                .replace("{remaining}", remaining);
        Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(plugin.msg(msg)));
    }

    private static String formatGold(double gold) {
        if (gold == Math.rint(gold)) {
            return String.valueOf((long) gold);
        }
        return String.valueOf(gold);
    }

    private static String formatDuration(Duration d) {
        long hours = d.toHours();
        long mins = d.toMinutesPart();
        if (hours > 0) {
            return hours + "h " + mins + "m";
        }
        return Math.max(1, mins) + "m";
    }
}
