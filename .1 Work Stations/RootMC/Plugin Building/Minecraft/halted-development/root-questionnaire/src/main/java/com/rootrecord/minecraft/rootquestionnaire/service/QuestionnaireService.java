package com.rootrecord.minecraft.rootquestionnaire.service;

import com.rootrecord.minecraft.common.RootMcTreasuryService;
import com.rootrecord.minecraft.rootquestionnaire.RootQuestionnairePlugin;
import com.rootrecord.minecraft.rootquestionnaire.cloud.QuestionnaireCloudClient;
import com.rootrecord.minecraft.rootquestionnaire.config.QuestionnaireConfig;
import com.rootrecord.minecraft.rootquestionnaire.data.QuestionnaireStore;
import com.rootrecord.minecraft.rootquestionnaire.model.QuestionnaireCatalog;
import com.rootrecord.minecraft.rootquestionnaire.model.SurveyQuestion;
import com.rootrecord.minecraft.rootquestionnaire.session.QuestionnaireSession;
import com.rootrecord.minecraft.rootquestionnaire.session.QuestionnaireSessionManager;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;

public final class QuestionnaireService {

    private final RootQuestionnairePlugin plugin;
    private final QuestionnaireStore store;
    private final QuestionnaireSessionManager sessions;
    private final QuestionnaireCloudClient cloud;

    public QuestionnaireService(
            RootQuestionnairePlugin plugin,
            QuestionnaireStore store,
            QuestionnaireSessionManager sessions,
            QuestionnaireCloudClient cloud) {
        this.plugin = plugin;
        this.store = store;
        this.sessions = sessions;
        this.cloud = cloud;
    }

    public void beginSurvey(Player player) {
        QuestionnaireConfig cfg = plugin.questionnaireConfig();
        if (!cfg.enabled()) {
            player.sendMessage(plugin.msg("disabled"));
            return;
        }
        if (!player.hasPermission("rootquestionnaire.use")) {
            player.sendMessage(plugin.msg("no-permission"));
            return;
        }

        UUID uuid = player.getUniqueId();
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                if (!cfg.mysqlConfigured()) {
                    sendSync(player, plugin.msg("not-eligible"));
                    return;
                }
                if (store.isCompleted(uuid)) {
                    sendSync(player, plugin.msg("already-completed"));
                    return;
                }
                long played = store.readTotalPlaytimeSeconds(uuid);
                if (played < cfg.minPlaytimeSeconds()) {
                    sendSync(player, plugin.msg("playtime-required")
                            .replace("{played}", formatDuration(played))
                            .replace("{remaining}", formatDuration(cfg.minPlaytimeSeconds() - played)));
                    return;
                }
                Bukkit.getScheduler().runTask(plugin, () -> startSession(player));
            } catch (Exception ex) {
                plugin.getLogger().log(Level.WARNING, "Survey eligibility check failed for " + player.getName(), ex);
                sendSync(player, plugin.msg("not-eligible"));
            }
        });
    }

    private void startSession(Player player) {
        QuestionnaireSession existing = sessions.get(player.getUniqueId());
        if (existing != null && isExpired(existing)) {
            sessions.remove(player.getUniqueId());
            existing = null;
        }
        if (existing == null) {
            existing = sessions.start(player.getUniqueId());
            player.sendMessage(plugin.msg("started").replace("{reward}", formatGold(plugin.questionnaireConfig().rewardGold())));
            player.sendMessage(plugin.msg("type-cancel-hint"));
        }
        promptCurrent(player, existing);
    }

    public void handleAnswer(Player player, String rawMessage) {
        QuestionnaireSession session = sessions.get(player.getUniqueId());
        if (session == null) {
            return;
        }
        if (isExpired(session)) {
            sessions.remove(player.getUniqueId());
            player.sendMessage(plugin.msg("session-expired"));
            return;
        }

        String message = rawMessage.trim();
        if (message.equalsIgnoreCase("cancel")) {
            sessions.remove(player.getUniqueId());
            player.sendMessage(plugin.msg("cancelled"));
            return;
        }

        if (session.inFollowUp()) {
            handleFollowUp(player, session, message);
            return;
        }

        SurveyQuestion question = session.currentQuestion();
        switch (question.type()) {
            case OPEN -> acceptAndAdvance(player, session, question.id(), message);
            case YES_NO -> handleYesNo(player, session, question, message);
            case SCALE -> handleScale(player, session, question, message);
            case CHOICE -> handleChoice(player, session, question, message);
        }
    }

    private void handleYesNo(Player player, QuestionnaireSession session, SurveyQuestion question, String message) {
        String lower = message.toLowerCase(Locale.ROOT);
        if (!lower.equals("yes") && !lower.equals("no") && !lower.equals("y") && !lower.equals("n")) {
            player.sendMessage(plugin.msg("invalid-yes-no"));
            return;
        }
        boolean yes = lower.startsWith("y");
        session.recordAnswer(question.id(), yes ? "Yes" : "No");
        if (yes && question.followUpPrompt() != null && !question.followUpPrompt().isBlank()) {
            session.beginFollowUp();
            player.sendMessage(plugin.msg("follow-up-header"));
            player.sendMessage(plugin.colorize(question.followUpPrompt()));
            return;
        }
        session.advance();
        continueOrComplete(player, session);
    }

    private void handleFollowUp(Player player, QuestionnaireSession session, String message) {
        SurveyQuestion question = session.currentQuestion();
        String value = message.equalsIgnoreCase("skip") ? "(skipped)" : message;
        session.recordAnswer(question.id() + "_followup", value);
        session.endFollowUpAndAdvance();
        continueOrComplete(player, session);
    }

    private void handleScale(Player player, QuestionnaireSession session, SurveyQuestion question, String message) {
        int value;
        try {
            value = Integer.parseInt(message.trim());
        } catch (NumberFormatException ex) {
            player.sendMessage(plugin.msg("invalid-scale"));
            return;
        }
        if (value < 1 || value > 10) {
            player.sendMessage(plugin.msg("invalid-scale"));
            return;
        }
        acceptAndAdvance(player, session, question.id(), String.valueOf(value));
    }

    private void handleChoice(Player player, QuestionnaireSession session, SurveyQuestion question, String message) {
        String matched = matchChoice(question.choices(), message);
        if (matched == null) {
            player.sendMessage(plugin.msg("invalid-choice").replace("{choices}", String.join(", ", question.choices())));
            return;
        }
        acceptAndAdvance(player, session, question.id(), matched);
    }

    private void acceptAndAdvance(Player player, QuestionnaireSession session, String key, String value) {
        session.recordAnswer(key, value);
        session.advance();
        continueOrComplete(player, session);
    }

    private void continueOrComplete(Player player, QuestionnaireSession session) {
        if (session.isComplete()) {
            completeSurvey(player, session);
            return;
        }
        promptCurrent(player, session);
    }

    private void completeSurvey(Player player, QuestionnaireSession session) {
        sessions.remove(player.getUniqueId());
        QuestionnaireConfig cfg = plugin.questionnaireConfig();
        Map<String, String> answers = new LinkedHashMap<>(session.answers());
        String answersJson = toJson(answers);
        List<QuestionnaireCloudClient.AnswerEntry> discordAnswers = buildDiscordAnswers(answers);
        String worldName = player.getWorld().getName();

        Bukkit.getScheduler().runTask(plugin, () -> {
            if (!player.isOnline()) {
                return;
            }
            boolean paid = payReward(player);
            if (!paid) {
                player.sendMessage(plugin.msg("reward-failed"));
                return;
            }

            Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
                try {
                    store.saveCompletion(
                            player.getUniqueId(),
                            player.getName(),
                            answersJson,
                            cfg.rewardGold(),
                            true);
                } catch (Exception ex) {
                    plugin.getLogger().log(Level.WARNING, "Completion save failed for " + player.getName(), ex);
                }

                boolean discordOk = postDiscord(player, worldName, discordAnswers);
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (!player.isOnline()) {
                        return;
                    }
                    player.sendMessage(plugin.msg("reward-success").replace("{reward}", formatGold(cfg.rewardGold())));
                    if (!discordOk) {
                        player.sendMessage(plugin.msg("discord-failed"));
                    }
                });
            });
        });
    }

    private boolean payReward(Player player) {
        RootMcTreasuryService treasury = plugin.treasury();
        if (treasury == null) {
            return false;
        }
        return treasury.grantToPlayer(
                player.getUniqueId(),
                player.getName(),
                plugin.questionnaireConfig().rewardGold(),
                null,
                "questionnaire",
                "one-time-survey");
    }

    private boolean postDiscord(Player player, String worldName, List<QuestionnaireCloudClient.AnswerEntry> answers) {
        if (!cloud.hasCredentials()) {
            plugin.getLogger().warning("Cloud credentials missing — questionnaire Discord post skipped.");
            return false;
        }
        try {
            cloud.submitQuestionnaire(
                    player.getUniqueId().toString(),
                    player.getName(),
                    worldName,
                    answers);
            return true;
        } catch (Exception ex) {
            plugin.getLogger().log(Level.WARNING, "Questionnaire Discord post failed for " + player.getName(), ex);
            return false;
        }
    }

    public void sendStatus(Player player) {
        UUID uuid = player.getUniqueId();
        QuestionnaireConfig cfg = plugin.questionnaireConfig();
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                if (store.isCompleted(uuid)) {
                    sendSync(player, plugin.msg("status-complete"));
                    return;
                }
                long played = store.readTotalPlaytimeSeconds(uuid);
                if (played < cfg.minPlaytimeSeconds()) {
                    sendSync(player, plugin.msg("status-locked")
                            .replace("{remaining}", formatDuration(cfg.minPlaytimeSeconds() - played)));
                    return;
                }
                sendSync(player, plugin.msg("status-pending").replace("{reward}", formatGold(cfg.rewardGold())));
            } catch (Exception ex) {
                sendSync(player, plugin.msg("not-eligible"));
            }
        });
    }

    public void maybeSendJoinHint(Player player) {
        if (!player.hasPermission("rootquestionnaire.use") || !plugin.questionnaireConfig().enabled()) {
            return;
        }
        UUID uuid = player.getUniqueId();
        QuestionnaireConfig cfg = plugin.questionnaireConfig();
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (!player.isOnline()) {
                return;
            }
            Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
                try {
                    if (store.isCompleted(uuid)) {
                        return;
                    }
                    long played = store.readTotalPlaytimeSeconds(uuid);
                    if (played < cfg.minPlaytimeSeconds()) {
                        return;
                    }
                    sendSync(player, plugin.msg("join-hint").replace("{reward}", formatGold(cfg.rewardGold())));
                } catch (Exception ignored) {
                    // fail closed — no join spam on DB errors
                }
            });
        }, 60L);
    }

    public void promptCurrent(Player player, QuestionnaireSession session) {
        SurveyQuestion question = session.currentQuestion();
        int current = session.questionIndex() + 1;
        player.sendMessage(plugin.msg("question-header")
                .replace("{current}", String.valueOf(current))
                .replace("{total}", String.valueOf(QuestionnaireCatalog.totalQuestions())));
        player.sendMessage(plugin.colorize(question.prompt()));
    }

    private boolean isExpired(QuestionnaireSession session) {
        long timeoutMs = plugin.questionnaireConfig().sessionTimeoutMinutes() * 60_000L;
        return System.currentTimeMillis() - session.lastActivityAt() > timeoutMs;
    }

    private static String matchChoice(List<String> choices, String message) {
        String trimmed = message.trim();
        for (String choice : choices) {
            if (choice.equalsIgnoreCase(trimmed)) {
                return choice;
            }
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        for (String choice : choices) {
            if (choice.toLowerCase(Locale.ROOT).equals(lower)) {
                return choice;
            }
        }
        return null;
    }

    private static List<QuestionnaireCloudClient.AnswerEntry> buildDiscordAnswers(Map<String, String> answers) {
        List<QuestionnaireCloudClient.AnswerEntry> out = new ArrayList<>();
        for (SurveyQuestion question : QuestionnaireCatalog.questions()) {
            String main = answers.get(question.id());
            if (main != null) {
                out.add(new QuestionnaireCloudClient.AnswerEntry(question.id(), question.label(), main));
            }
            String followUp = answers.get(question.id() + "_followup");
            if (followUp != null) {
                out.add(new QuestionnaireCloudClient.AnswerEntry(
                        question.id() + "_followup", question.label() + " (detail)", followUp));
            }
        }
        for (Map.Entry<String, String> entry : answers.entrySet()) {
            if (out.stream().noneMatch(a -> a.id().equals(entry.getKey()))) {
                out.add(new QuestionnaireCloudClient.AnswerEntry(entry.getKey(), entry.getKey(), entry.getValue()));
            }
        }
        return out;
    }

    private static String toJson(Map<String, String> answers) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> entry : answers.entrySet()) {
            if (!first) {
                sb.append(',');
            }
            first = false;
            sb.append('"').append(escapeJson(entry.getKey())).append("\":\"")
                    .append(escapeJson(entry.getValue())).append('"');
        }
        sb.append('}');
        return sb.toString();
    }

    private static String escapeJson(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }

    private void sendSync(Player player, String message) {
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) {
                player.sendMessage(message);
            }
        });
    }

    private static String formatDuration(long seconds) {
        if (seconds < 60) {
            return seconds + "s";
        }
        long minutes = seconds / 60;
        if (minutes < 60) {
            return minutes + "m";
        }
        long hours = minutes / 60;
        long remMin = minutes % 60;
        return remMin == 0 ? hours + "h" : hours + "h " + remMin + "m";
    }

    private static String formatGold(double amount) {
        if (Math.rint(amount) == amount) {
            return String.valueOf((long) amount);
        }
        return String.valueOf(amount);
    }
}
