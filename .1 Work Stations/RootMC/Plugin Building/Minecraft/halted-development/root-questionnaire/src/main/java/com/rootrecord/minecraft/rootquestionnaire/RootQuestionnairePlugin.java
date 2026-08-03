package com.rootrecord.minecraft.rootquestionnaire;

import com.rootrecord.minecraft.common.RootMcTreasuryResolver;
import com.rootrecord.minecraft.common.RootMcTreasuryService;
import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootquestionnaire.cloud.QuestionnaireCloudClient;
import com.rootrecord.minecraft.rootquestionnaire.command.QuestionairCommand;
import com.rootrecord.minecraft.rootquestionnaire.command.RootQuestionnaireAdminCommand;
import com.rootrecord.minecraft.rootquestionnaire.config.QuestionnaireConfig;
import com.rootrecord.minecraft.rootquestionnaire.data.QuestionnaireStore;
import com.rootrecord.minecraft.rootquestionnaire.listener.QuestionnaireChatListener;
import com.rootrecord.minecraft.rootquestionnaire.listener.QuestionnaireJoinListener;
import com.rootrecord.minecraft.rootquestionnaire.service.QuestionnaireService;
import com.rootrecord.minecraft.rootquestionnaire.session.QuestionnaireSessionManager;
import org.bukkit.ChatColor;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

public final class RootQuestionnairePlugin extends JavaPlugin {

    private RootRecordYamlConfig yamlConfig;
    private QuestionnaireConfig config;
    private QuestionnaireStore store;
    private QuestionnaireSessionManager sessions;
    private QuestionnaireCloudClient cloud;
    private QuestionnaireService service;

    @Override
    public void onEnable() {
        RootRecordFolders.ensureDir(this);
        RootRecordCloudConfig.ensureDefaults(this);
        yamlConfig = new RootRecordYamlConfig(
                this, RootRecordFolders.ROOT_QUESTIONNAIRE_CONFIG, "root-questionnaire.yml");
        sessions = new QuestionnaireSessionManager();
        reloadLocalConfig();

        var questionair = getCommand("questionair");
        if (questionair != null) {
            QuestionairCommand handler = new QuestionairCommand(this);
            questionair.setExecutor(handler);
            questionair.setTabCompleter(handler);
        }
        var admin = getCommand("rootquestionnaire");
        if (admin != null) {
            admin.setExecutor(new RootQuestionnaireAdminCommand(this));
        }

        getServer().getPluginManager().registerEvents(new QuestionnaireChatListener(this), this);
        getServer().getPluginManager().registerEvents(new QuestionnaireJoinListener(this), this);

        getLogger().info("Root-Questionnaire enabled — one-time survey, "
                + config.rewardGold() + " G reward after "
                + (config.minPlaytimeSeconds() / 60) + "m playtime.");
    }

    public void reloadLocalConfig() {
        if (yamlConfig != null) {
            yamlConfig.reload();
        }
        FileConfiguration cfg = yamlConfig != null ? yamlConfig.config() : null;
        config = QuestionnaireConfig.from(cfg);
        store = new QuestionnaireStore(config);
        try {
            if (config.mysqlEnabled()) {
                store.initSchema();
            }
        } catch (Exception ex) {
            getLogger().severe("MySQL init failed: " + ex.getMessage());
        }
        cloud = new QuestionnaireCloudClient(
                RootRecordCloudConfig.resolve(this, yamlConfig != null ? yamlConfig.config() : null));
        service = new QuestionnaireService(this, store, sessions, cloud);
    }

    public QuestionnaireConfig questionnaireConfig() {
        return config;
    }

    public QuestionnaireStore store() {
        return store;
    }

    public QuestionnaireSessionManager sessions() {
        return sessions;
    }

    public QuestionnaireService service() {
        return service;
    }

    public QuestionnaireCloudClient cloud() {
        return cloud;
    }

    public RootMcTreasuryService treasury() {
        return RootMcTreasuryResolver.resolve(this);
    }

    public String msg(String key) {
        return colorize(rawMsg(key));
    }

    public String rawMsg(String key) {
        String prefix = config.prefix();
        String body = config.messages().getOrDefault(key, "&7[" + key + "]");
        if (prefix == null || prefix.isBlank()) {
            return body;
        }
        return prefix + body;
    }

    public String colorize(String text) {
        if (text == null) {
            return "";
        }
        return ChatColor.translateAlternateColorCodes('&', text);
    }
}
