package com.rootrecord.minecraft.rootask.service;

import com.rootrecord.minecraft.rootask.RootAskPlugin;
import com.rootrecord.minecraft.rootask.chat.GuideChatDelivery;
import com.rootrecord.minecraft.rootask.cloud.AskCloudClient;
import com.rootrecord.minecraft.rootask.session.AskSessionManager;
import com.rootrecord.minecraft.rootask.util.TopicGate;
import org.bukkit.entity.Player;

public final class AskGuideService {

    private final RootAskPlugin plugin;
    private final AskSessionManager sessions = new AskSessionManager();

    public AskGuideService(RootAskPlugin plugin) {
        this.plugin = plugin;
    }

    public AskSessionManager sessions() {
        return sessions;
    }

    public void submitQuestion(Player player, String question) {
        if (!TopicGate.isRootMcQuestion(question)) {
            player.sendMessage(plugin.msg("off-topic"));
            return;
        }
        if (!plugin.cloud().hasCredentials()) {
            player.sendMessage(plugin.msg("no-cloud"));
            return;
        }

        player.sendMessage(plugin.msg("thinking"));

        String world = player.getWorld() != null ? player.getWorld().getName() : "";
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                AskCloudClient.AskResponse response = plugin.cloud().ask(
                        player.getUniqueId().toString(),
                        player.getName(),
                        world,
                        question);
                plugin.getServer().getScheduler().runTask(plugin, () -> deliverAskResponse(player, response));
            } catch (Exception ex) {
                plugin.getServer().getScheduler().runTask(plugin, () -> {
                    if (player.isOnline()) {
                        player.sendMessage(plugin.colorize(
                                plugin.rawMsg("fail").replace("{error}", ex.getMessage())));
                    }
                });
            }
        });
    }

    public void submitFeedback(Player player, boolean positive) {
        AskSessionManager.Session session = sessions.activeSession(player.getUniqueId());
        if (session == null) {
            player.sendMessage(plugin.msg("feedback-none"));
            return;
        }

        player.sendMessage(plugin.msg(positive ? "feedback-thanks" : "feedback-retrying"));

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                AskCloudClient.FeedbackResponse response = plugin.cloud().feedback(
                        player.getUniqueId().toString(),
                        player.getName(),
                        session.turnId(),
                        positive ? "yes" : "no");
                plugin.getServer().getScheduler().runTask(plugin, () -> deliverFeedbackResponse(player, response));
            } catch (Exception ex) {
                plugin.getServer().getScheduler().runTask(plugin, () -> {
                    if (player.isOnline()) {
                        player.sendMessage(plugin.colorize(
                                plugin.rawMsg("fail").replace("{error}", ex.getMessage())));
                    }
                });
            }
        });
    }

    private void deliverAskResponse(Player player, AskCloudClient.AskResponse response) {
        if (!player.isOnline()) {
            return;
        }
        if (!response.ok()) {
            if (response.quota()) {
                player.sendMessage(plugin.msg("quota"));
            } else {
                player.sendMessage(plugin.colorize(
                        plugin.rawMsg("fail").replace(
                                "{error}",
                                response.errorMessage() != null ? response.errorMessage() : "unknown")));
            }
            return;
        }

        GuideChatDelivery.send(plugin, player, response.lines(), response.linkUrl());

        if (response.duplicate() || !response.needsFeedback() || response.turnId() <= 0) {
            sessions.clear(player.getUniqueId());
            return;
        }

        sessions.startFeedback(player.getUniqueId(), response.turnId());
        player.sendMessage(plugin.msg("feedback-prompt"));
    }

    private void deliverFeedbackResponse(Player player, AskCloudClient.FeedbackResponse response) {
        if (!player.isOnline()) {
            return;
        }
        if (!response.ok()) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("fail").replace(
                            "{error}",
                            response.errorMessage() != null ? response.errorMessage() : "unknown")));
            return;
        }

        if ("closed".equals(response.action()) || "give_up".equals(response.action())) {
            if (response.lines() != null && !response.lines().isEmpty()) {
                GuideChatDelivery.send(plugin, player, response.lines(), response.linkUrl());
            }
            sessions.clear(player.getUniqueId());
            if ("closed".equals(response.action())) {
                player.sendMessage(plugin.msg("feedback-closed"));
            }
            return;
        }

        if ("followup".equals(response.action())) {
            GuideChatDelivery.send(plugin, player, response.lines(), response.linkUrl());
            if (response.turnId() > 0) {
                sessions.advanceToFollowup(player.getUniqueId(), response.turnId());
                player.sendMessage(plugin.msg("feedback-prompt"));
            } else {
                sessions.clear(player.getUniqueId());
            }
        }
    }
}
