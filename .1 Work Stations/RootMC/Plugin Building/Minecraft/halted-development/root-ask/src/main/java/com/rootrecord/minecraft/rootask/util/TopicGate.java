package com.rootrecord.minecraft.rootask.util;

import java.util.List;
import java.util.Locale;

public final class TopicGate {

    private static final List<String> ON_TOPIC = List.of(
            "rootmc", "gold", "shop", "shops", "rank", "ranks", "town", "towns", "nation", "nations",
            "towny", "command", "commands", "link", "verify", "discord", "buy", "sell", "net worth",
            "networth", "mcmmo", "spawn", "chamber", "chest", "warp", "home", "claim", "mayor",
            "resident", "leaderboard", "wiki", "minecraft", "server", "economy", "inventory",
            "balance", "listing", "sign", "market", "playtime", "treasury", "vault", "blueprint",
            "realm", "afk", "mute", "ban", "appeal", "staff", "rules");

    private static final List<String> OFF_TOPIC = List.of(
            "homework", "essay", "girlfriend", "boyfriend", "politics", "president", "trump", "biden",
            "recipe", "cooking", "fortnite", "roblox", "valorant", "tell me a joke", "make me laugh",
            "who made you", "what are you", "are you ai", "bitcoin", "ethereum", "crypto",
            "stock market", "dating", "relationship advice", "write me a", "solve this math");

    private TopicGate() {}

    public static boolean isRootMcQuestion(String raw) {
        if (raw == null || raw.isBlank()) {
            return false;
        }
        String q = normalize(raw);
        if (q.isEmpty()) {
            return false;
        }

        int onHits = 0;
        int offHits = 0;
        for (String hint : ON_TOPIC) {
            if (q.contains(hint)) {
                onHits++;
            }
        }
        for (String hint : OFF_TOPIC) {
            if (q.contains(hint)) {
                offHits++;
            }
        }
        if (offHits > 0 && onHits == 0) {
            return false;
        }
        if (onHits > 0) {
            return true;
        }

        boolean gameQuestion = q.contains("?")
                || q.startsWith("how ")
                || q.startsWith("what ")
                || q.startsWith("where ")
                || q.startsWith("why ")
                || q.startsWith("can i ")
                || q.startsWith("does ");
        if (!gameQuestion) {
            return false;
        }
        if (q.matches("^(how are you|whats up|what's up|hello|hi|hey|sup)\\b.*")) {
            return false;
        }
        return q.length() >= 8;
    }

    private static String normalize(String raw) {
        return raw.toLowerCase(Locale.ROOT)
                .replaceAll("§[0-9a-fk-or]", "")
                .replaceAll("&[0-9a-fk-or]", "")
                .replaceAll("[^a-z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }
}
