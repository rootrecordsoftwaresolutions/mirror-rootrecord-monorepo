package com.rootrecord.minecraft.roothelp.config;

import org.bukkit.configuration.file.FileConfiguration;

import java.util.List;

public record HelpConfig(
        String discordInviteUrl,
        String discordGuildName,
        String verifyUrl,
        String wikiCommandsUrl,
        String mapBaseUrl,
        int linesPerPage,
        List<String> rules) {

    public static HelpConfig from(FileConfiguration cfg) {
        if (cfg == null) {
            return defaults();
        }
        List<String> rules = cfg.getStringList("rules");
        if (rules.isEmpty()) {
            rules = defaults().rules;
        }
        return new HelpConfig(
                cfg.getString("discord.invite-url", defaults().discordInviteUrl),
                cfg.getString("discord.guild-name", defaults().discordGuildName),
                cfg.getString("discord.verify-url", defaults().verifyUrl),
                cfg.getString("discord.wiki-commands-url", defaults().wikiCommandsUrl),
                cfg.getString("map.base-url", ""),
                Math.max(4, cfg.getInt("commands.lines-per-page", 10)),
                List.copyOf(rules));
    }

    private static HelpConfig defaults() {
        return new HelpConfig(
                "https://discord.gg/rFFQYrNaqS",
                "RootMC Discord",
                "https://rootmc.net/verify",
                "https://rootmc.net/wiki/player/#commands",
                "",
                10,
                List.of());
    }
}
