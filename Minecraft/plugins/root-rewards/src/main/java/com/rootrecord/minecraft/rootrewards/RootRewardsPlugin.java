package com.rootrecord.minecraft.rootrewards;

import com.rootrecord.minecraft.common.RootMcEconomyService;
import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootrewards.command.RewardsCommand;
import com.rootrecord.minecraft.rootrewards.command.RootRewardsAdminCommand;
import com.rootrecord.minecraft.rootrewards.command.VoteCommand;
import com.rootrecord.minecraft.rootrewards.config.RewardsConfig;
import com.rootrecord.minecraft.rootrewards.config.RewardsMessages;
import com.rootrecord.minecraft.rootrewards.data.RewardsStore;
import com.rootrecord.minecraft.rootrewards.economy.RewardsEconomy;
import com.rootrecord.minecraft.rootrewards.listener.PlaytimeSessionListener;
import com.rootrecord.minecraft.rootrewards.listener.VotifierVoteHook;
import com.rootrecord.minecraft.rootrewards.service.PlaytimeRewardService;
import com.rootrecord.minecraft.rootrewards.service.VoteRewardService;
import net.milkbowl.vault.economy.Economy;
import org.bukkit.ChatColor;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

public final class RootRewardsPlugin extends JavaPlugin {

    private RootRecordYamlConfig yamlConfig;
    private RewardsConfig rewardsConfig;
    private RewardsMessages messages;
    private RewardsStore store;
    private RewardsEconomy economy;
    private PlaytimeRewardService playtimeRewards;
    private VoteRewardService voteRewards;
    private BukkitTask playtimeTask;
    private boolean votifierActive;

    @Override
    public void onEnable() {
        RootRecordFolders.ensureDir(this);
        yamlConfig = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_REWARDS_CONFIG, "root-rewards.yml");
        yamlConfig.load();
        reloadLocalConfig();

        if (!economy.available()) {
            getLogger().severe("No economy (Root Essentials or Vault) — disabling Root-Rewards.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        registerCommands();
        getServer().getPluginManager().registerEvents(new PlaytimeSessionListener(this, store), this);
        registerVotifier();
        startPlaytimeTask();

        getLogger().info("Root-Rewards enabled — playtime milestones + vote rewards.");
    }

    @Override
    public void onDisable() {
        if (playtimeTask != null) {
            playtimeTask.cancel();
            playtimeTask = null;
        }
    }

    public void reloadLocalConfig() {
        if (yamlConfig != null) {
            yamlConfig.reload();
        }
        FileConfiguration cfg = yamlConfig != null ? yamlConfig.config() : null;
        rewardsConfig = RewardsConfig.from(cfg);
        messages = RewardsMessages.from(cfg);
        store = new RewardsStore(rewardsConfig);
        try {
            if (rewardsConfig.mysqlEnabled()) {
                store.initSchema();
            }
        } catch (Exception ex) {
            getLogger().severe("MySQL init failed: " + ex.getMessage());
        }
        economy = new RewardsEconomy(resolveRootEconomy(), resolveVault());
        playtimeRewards = new PlaytimeRewardService(this, store, economy, PlaytimeMilestones.defaults());
        voteRewards = new VoteRewardService(this, store, economy);
    }

    public void restartPlaytimeTask() {
        startPlaytimeTask();
    }

    private void registerCommands() {
        var rewards = getCommand("rewards");
        if (rewards != null) {
            rewards.setExecutor(new RewardsCommand(this));
        }
        var vote = getCommand("vote");
        if (vote != null) {
            vote.setExecutor(new VoteCommand(this));
        }
        var admin = getCommand("rootrewards");
        if (admin != null) {
            admin.setExecutor(new RootRewardsAdminCommand(this));
        }
    }

    private void registerVotifier() {
        votifierActive = getServer().getPluginManager().getPlugin("NuVotifier") != null
                || getServer().getPluginManager().getPlugin("VotifierPlus") != null
                || getServer().getPluginManager().getPlugin("Votifier") != null;
        if (votifierActive) {
            if (new VotifierVoteHook(this).register()) {
                getLogger().info("Votifier vote listener registered.");
            } else {
                getLogger().warning("Votifier plugin present but VotifierEvent class not found.");
            }
        } else {
            getLogger().warning("NuVotifier/VotifierPlus not found — vote gold will not auto-grant until installed.");
        }
    }

    private void startPlaytimeTask() {
        if (playtimeTask != null) {
            playtimeTask.cancel();
        }
        long interval = rewardsConfig.playtimeCheckIntervalSeconds() * 20L;
        playtimeTask = getServer().getScheduler().runTaskTimer(
                this,
                () -> playtimeRewards.checkOnlinePlayers(),
                interval,
                interval);
    }

    private RootMcEconomyService resolveRootEconomy() {
        RegisteredServiceProvider<RootMcEconomyService> rsp =
                getServer().getServicesManager().getRegistration(RootMcEconomyService.class);
        return rsp != null ? rsp.getProvider() : null;
    }

    private Economy resolveVault() {
        if (getServer().getPluginManager().getPlugin("Vault") == null) {
            return null;
        }
        RegisteredServiceProvider<Economy> rsp =
                getServer().getServicesManager().getRegistration(Economy.class);
        return rsp != null ? rsp.getProvider() : null;
    }

    public RewardsConfig rewardsConfig() {
        return rewardsConfig;
    }

    public PlaytimeRewardService playtimeRewards() {
        return playtimeRewards;
    }

    public VoteRewardService voteRewards() {
        return voteRewards;
    }

    public boolean votifierActive() {
        return votifierActive;
    }

    public String colorize(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "";
        }
        return ChatColor.translateAlternateColorCodes('&', raw);
    }

    public String msg(String body) {
        return colorize(messages.prefix() + body);
    }

    public String rawMsg(String key) {
        return yamlConfig.config().getString("messages." + key, "");
    }
}
