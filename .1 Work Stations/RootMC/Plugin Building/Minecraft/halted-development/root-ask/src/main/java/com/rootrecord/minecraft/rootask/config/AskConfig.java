package com.rootrecord.minecraft.rootask.config;



import org.bukkit.configuration.file.FileConfiguration;



import java.util.ArrayList;

import java.util.List;



public record AskConfig(

        int cooldownSeconds,

        int chunkDelayTicks,

        int maxQuestionLength,

        boolean proactiveEnabled,

        int proactiveCooldownMinutes,

        int proactiveMinChars,

        List<String> proactiveKeywords,

        List<String> proactiveSkipPatterns) {



    public static AskConfig from(FileConfiguration cfg) {

        if (cfg == null) {

            return defaults();

        }

        int cooldown = Math.max(5, cfg.getInt("ask.cooldown-seconds", 45));

        int delay = Math.max(1, cfg.getInt("ask.chunk-delay-ticks", 3));

        int maxLen = Math.max(20, Math.min(240, cfg.getInt("ask.max-question-length", 200)));

        boolean proactive = cfg.getBoolean("proactive.enabled", true);

        int proactiveCooldown = Math.max(15, cfg.getInt("proactive.cooldown-minutes", 45));

        int proactiveMin = Math.max(8, cfg.getInt("proactive.min-chars", 12));

        List<String> keywords = cfg.getStringList("proactive.question-keywords");

        if (keywords.isEmpty()) {

            keywords = defaultKeywords();

        }

        List<String> skip = cfg.getStringList("proactive.skip-patterns");

        if (skip.isEmpty()) {

            skip = defaultSkipPatterns();

        }

        return new AskConfig(cooldown, delay, maxLen, proactive, proactiveCooldown, proactiveMin, keywords, skip);

    }



    private static AskConfig defaults() {

        return new AskConfig(45, 3, 200, true, 45, 12, defaultKeywords(), defaultSkipPatterns());

    }



    private static List<String> defaultKeywords() {

        return List.of(

                "how do i", "how to", "what is", "where is", "command", "shop", "rank",

                "town", "nation", "gold", "net worth", "mcmmo", "link", "verify", "buy", "sell");

    }



    private static List<String> defaultSkipPatterns() {

        List<String> patterns = new ArrayList<>();

        patterns.add("^you\\b");

        patterns.add("^lol");

        patterns.add("^bruh");

        patterns.add("^gg\\b");

        patterns.add("^nice\\b");

        return patterns;

    }

}

