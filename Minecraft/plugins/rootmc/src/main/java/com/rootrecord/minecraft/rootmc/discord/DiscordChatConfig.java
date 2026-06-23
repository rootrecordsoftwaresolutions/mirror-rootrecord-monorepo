package com.rootrecord.minecraft.rootmc.discord;



import org.bukkit.configuration.file.FileConfiguration;



public final class DiscordChatConfig {



    private final boolean enabled;

    private final int pollIntervalSeconds;

    private final String inboundFormat;

    private final boolean relayChat;

    private final boolean relayJoin;

    private final boolean relayLeave;

    private final boolean relayDeath;



    private DiscordChatConfig(

            boolean enabled,

            int pollIntervalSeconds,

            String inboundFormat,

            boolean relayChat,

            boolean relayJoin,

            boolean relayLeave,

            boolean relayDeath) {

        this.enabled = enabled;

        this.pollIntervalSeconds = pollIntervalSeconds;

        this.inboundFormat = inboundFormat;

        this.relayChat = relayChat;

        this.relayJoin = relayJoin;

        this.relayLeave = relayLeave;

        this.relayDeath = relayDeath;

    }



    public static DiscordChatConfig from(FileConfiguration cfg) {

        return new DiscordChatConfig(

                cfg.getBoolean("discord-chat.enabled", false),

                Math.max(2, cfg.getInt("discord-chat.poll-interval-seconds", 3)),

                cfg.getString(

                        "discord-chat.inbound-format",

                        "&8▎ &9Discord&8│ &f{user}&8 &7»&f {message}"),

                cfg.getBoolean("discord-chat.relay-chat", true),

                cfg.getBoolean("discord-chat.relay-join", true),

                cfg.getBoolean("discord-chat.relay-leave", true),

                cfg.getBoolean("discord-chat.relay-death", true));

    }



    public boolean enabled() {

        return enabled;

    }



    public int pollIntervalSeconds() {

        return pollIntervalSeconds;

    }



    public String inboundFormat() {

        return inboundFormat;

    }



    public boolean relayChat() {

        return relayChat;

    }



    public boolean relayJoin() {

        return relayJoin;

    }



    public boolean relayLeave() {

        return relayLeave;

    }



    public boolean relayDeath() {

        return relayDeath;

    }

}

