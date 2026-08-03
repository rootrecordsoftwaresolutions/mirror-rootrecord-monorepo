package com.rootrecord.minecraft.rootask;



import com.rootrecord.minecraft.common.RootRecordFolders;

import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;

import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;

import com.rootrecord.minecraft.rootask.cloud.AskCloudClient;

import com.rootrecord.minecraft.rootask.command.AskCommand;

import com.rootrecord.minecraft.rootask.config.AskConfig;

import com.rootrecord.minecraft.rootask.config.AskMessages;

import com.rootrecord.minecraft.rootask.listener.GameQuestionChatListener;

import com.rootrecord.minecraft.rootask.service.AskGuideService;

import org.bukkit.ChatColor;

import org.bukkit.plugin.java.JavaPlugin;



public final class RootAskPlugin extends JavaPlugin {



    private RootRecordYamlConfig yamlConfig;

    private AskConfig askConfig;

    private AskMessages messages;

    private AskCloudClient cloud;

    private AskGuideService guideService;



    @Override

    public void onEnable() {

        RootRecordCloudConfig.ensureDefaults(this);

        yamlConfig = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_ASK_CONFIG, "root-ask.yml");

        yamlConfig.load();

        reloadLocalConfig();



        var ask = getCommand("ask");

        if (ask != null) {

            var handler = new AskCommand(this);

            ask.setExecutor(handler);

            ask.setTabCompleter(handler);

        }



        getServer().getPluginManager().registerEvents(new GameQuestionChatListener(this), this);

        getLogger().info("Root-Ask enabled — /ask (use /ask yes|no after a guide answer).");

    }



    public void reloadLocalConfig() {

        if (yamlConfig != null) {

            yamlConfig.reload();

        }

        var cfg = yamlConfig != null ? yamlConfig.config() : null;

        askConfig = AskConfig.from(cfg);

        messages = AskMessages.from(cfg);

        cloud = new AskCloudClient(RootRecordCloudConfig.resolve(this, cfg));

        if (guideService == null) {
            guideService = new AskGuideService(this);
        }

    }



    public AskConfig askConfig() {

        return askConfig;

    }



    public AskMessages messages() {

        return messages;

    }



    public AskCloudClient cloud() {

        return cloud;

    }



    public AskGuideService guideService() {

        return guideService;

    }



    public String colorize(String raw) {

        if (raw == null || raw.isEmpty()) {

            return "";

        }

        return ChatColor.translateAlternateColorCodes('&', raw);

    }



    public String msg(String key) {

        return colorize(messages.prefix() + messages.get(key));

    }



    public String rawMsg(String key) {

        return messages.get(key);

    }

}

