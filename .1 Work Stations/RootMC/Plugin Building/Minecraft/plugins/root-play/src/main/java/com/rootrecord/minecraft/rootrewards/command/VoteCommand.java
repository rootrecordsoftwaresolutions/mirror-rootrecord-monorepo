package com.rootrecord.minecraft.rootrewards.command;

import com.rootrecord.minecraft.common.ChatLinks;
import com.rootrecord.minecraft.common.ChatUi;
import com.rootrecord.minecraft.common.ListingSiteCanonical;
import com.rootrecord.minecraft.rootrewards.RootRewardsPlugin;
import com.rootrecord.minecraft.rootrewards.config.RewardsConfig.VoteLink;
import com.rootrecord.minecraft.rootrewards.data.VoteTotals;
import com.rootrecord.minecraft.rootrewards.service.VoteSiteCooldown;
import com.rootrecord.minecraft.rootstat.RootStatBridge;
import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;

public final class VoteCommand implements CommandExecutor {

    private final RootRewardsPlugin plugin;

    public VoteCommand(RootRewardsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        var cfg = plugin.rewardsConfig();
        ChatUi.banner(sender, "Vote");
        ChatUi.entry(sender, "Reward", "+" + cfg.voteGoldMin() + "–" + cfg.voteGoldMax() + " G / site");

        if (cfg.voteLinks().isEmpty()) {
            ChatUi.tip(sender, "Ask staff to add vote links in root-rewards.yml.");
            if (!plugin.listenerOnline()) {
                ChatUi.entry(sender, "Listener", "offline · try later or /discord", "alert");
            } else if (!plugin.votifierActive() && plugin.rewardsConfig().voteNetworkListener()) {
                ChatUi.entry(sender, "Listener", "online · Towny ingest", "ok");
            }
            if (sender instanceof Player player) {
                appendGovernanceSection(player);
            }
            return true;
        }
        if (!(sender instanceof Player player)) {
            for (var link : cfg.voteLinks()) {
                ChatUi.entry(sender, link.name(), link.url());
            }
            return true;
        }
        Bukkit.getScheduler().runTaskAsynchronously(plugin.host(), () -> {
            Map<String, Instant> lastByService = Map.of();
            VoteTotals totals = VoteTotals.empty();
            try {
                lastByService = plugin.store().lastVotesByService(player.getUniqueId());
            } catch (Exception ex) {
                plugin.getLogger().log(Level.WARNING, "Failed to load vote timers for " + player.getName(), ex);
            }
            try {
                totals = plugin.store().readVoteTotals(player.getUniqueId());
            } catch (Exception ex) {
                plugin.getLogger().log(Level.WARNING, "Failed to load vote totals for " + player.getName(), ex);
            }
            Map<String, Instant> byCanonical = indexByCanonical(lastByService);
            Instant now = Instant.now();
            VoteTotals totalsFinal = totals;
            Bukkit.getScheduler().runTask(plugin.host(), () -> {
                if (!player.isOnline()) {
                    return;
                }
                ChatUi.entry(player, "Total", totalsFinal.voteCount() + " votes");
                for (VoteLink link : plugin.rewardsConfig().voteLinks()) {
                    Instant last = lookupLastVote(byCanonical, link);
                    boolean available = VoteSiteCooldown.available(link, last, now);
                    String remaining = null;
                    if (!available) {
                        Duration wait = Duration.between(now, VoteSiteCooldown.nextEligibleAt(link, last));
                        remaining = VoteSiteCooldown.formatRemaining(wait);
                    }
                    player.sendMessage(ChatLinks.voteSiteLine(link.name(), link.url(), available, remaining));
                }
                if (!plugin.listenerOnline()) {
                    ChatUi.entry(player, "Listener", "offline · try later or /discord", "alert");
                } else if (!plugin.votifierActive() && plugin.rewardsConfig().voteNetworkListener()) {
                    ChatUi.entry(player, "Listener", "online · Towny ingest", "ok");
                }
                appendGovernanceSection(player);
            });
        });
        return true;
    }

    private static Map<String, Instant> indexByCanonical(Map<String, Instant> lastByService) {
        Map<String, Instant> out = new HashMap<>();
        for (var entry : lastByService.entrySet()) {
            String key = ListingSiteCanonical.canonicalize(entry.getKey());
            Instant existing = out.get(key);
            if (existing == null || entry.getValue().isAfter(existing)) {
                out.put(key, entry.getValue());
            }
        }
        return out;
    }

    private static Instant lookupLastVote(Map<String, Instant> byCanonical, VoteLink link) {
        Instant byName = byCanonical.get(ListingSiteCanonical.canonicalize(link.name()));
        if (byName != null) {
            return byName;
        }
        Instant byUrl = byCanonical.get(ListingSiteCanonical.canonicalize(link.url()));
        if (byUrl != null) {
            return byUrl;
        }
        // Fallback: any stored service whose canonical id matches this link's id
        // (covers older rows stored before canonicalize, or odd Votifier labels).
        String want = ListingSiteCanonical.canonicalize(link.name());
        Instant best = null;
        for (var e : byCanonical.entrySet()) {
            if (!want.equals(e.getKey()) && !want.equals(ListingSiteCanonical.canonicalize(e.getKey()))) {
                continue;
            }
            if (best == null || e.getValue().isAfter(best)) {
                best = e.getValue();
            }
        }
        return best;
    }

    private void appendGovernanceSection(Player player) {
        Plugin rootmc = Bukkit.getPluginManager().getPlugin("RootMC");
        if (!(rootmc instanceof RootStatBridge bridge) || !rootmc.isEnabled()) {
            return;
        }
        Bukkit.getScheduler().runTaskAsynchronously(plugin.host(), () -> {
            try {
                CloudApiClient.GovernanceVotingPower power =
                        new com.rootrecord.minecraft.rootstat.governance.LocalGovernancePowerService(bridge)
                                .resolve(player.getUniqueId());
                Bukkit.getScheduler().runTask(plugin.host(), () -> {
                    if (!player.isOnline()) {
                        return;
                    }
                    if (!power.ok()) {
                        ChatUi.entry(player, "Power", "link Discord · /link", "open");
                        ChatUi.links(player, "Verify", "https://rootmc.net/verify");
                        return;
                    }
                    if (!power.eligible()) {
                        String reason = power.summary() != null ? power.summary().trim().toLowerCase() : "";
                        if (reason.contains("link")) {
                            ChatUi.entry(player, "Power", "link Discord · /link", "open");
                            ChatUi.links(player, "Verify", "https://rootmc.net/verify");
                            if (plugin.proposalNotify() != null) {
                                plugin.proposalNotify().appendToVoteCommand(player);
                            }
                            return;
                        }
                        String detail = power.summary() != null && !power.summary().isBlank()
                                ? power.summary().trim()
                                : "put Vote Shards in /ec";
                        ChatUi.entry(player, "Power", detail, "open");
                        try {
                            long seconds = plugin.store().readTotalPlaytimeSeconds(player.getUniqueId());
                            if (seconds > 0L) {
                                ChatUi.entry(
                                        player,
                                        "Playtime",
                                        com.rootrecord.minecraft.rootrewards.PlaytimeMilestones.formatDuration(seconds));
                            }
                        } catch (Exception ignored) {
                            // store optional for vote UI
                        }
                        ChatUi.links(
                                player,
                                "Constitution",
                                "https://rootmc.net/wiki/constitution/#governance-voting");
                        if (plugin.proposalNotify() != null) {
                            plugin.proposalNotify().appendToVoteCommand(player);
                        }
                        return;
                    }
                    String pct = String.format("%.3f", power.sharePercent());
                    ChatUi.entry(player, "Power", pct + "% · Council of Voters");
                    sendGovernanceSummary(player, power.summary());
                    if (power.votingChannelUrl() != null && !power.votingChannelUrl().isBlank()
                            && power.constitutionUrl() != null && !power.constitutionUrl().isBlank()) {
                        ChatUi.links(
                                player,
                                "Polls", power.votingChannelUrl(),
                                "Constitution", power.constitutionUrl());
                    } else if (power.votingChannelUrl() != null && !power.votingChannelUrl().isBlank()) {
                        ChatUi.links(player, "Polls", power.votingChannelUrl());
                    } else if (power.constitutionUrl() != null && !power.constitutionUrl().isBlank()) {
                        ChatUi.links(player, "Constitution", power.constitutionUrl());
                    }
                    if (plugin.proposalNotify() != null) {
                        plugin.proposalNotify().appendToVoteCommand(player);
                    }
                });
            } catch (Exception ignored) {
                // Cloud unreachable — listing vote links still shown
                if (plugin.proposalNotify() != null) {
                    plugin.proposalNotify().appendToVoteCommand(player);
                }
            }
        });
    }

    private void sendGovernanceSummary(Player player, String summary) {
        if (summary == null || summary.isBlank()) {
            return;
        }
        int n = 0;
        for (String line : summary.split("\\n")) {
            String cleaned = line.replace("**", "").trim();
            if (cleaned.isEmpty() || cleaned.toLowerCase().contains("of total governance power")) {
                continue;
            }
            ChatUi.tip(player, cleaned.replace('\u00a7', '&').replaceAll("(?i)&[0-9a-fk-or]", ""));
            if (++n >= 3) {
                break;
            }
        }
    }
}
