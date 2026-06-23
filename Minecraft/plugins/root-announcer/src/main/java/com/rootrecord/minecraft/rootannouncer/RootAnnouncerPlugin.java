package com.rootrecord.minecraft.rootannouncer;

import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootannouncer.cloud.SeasonCloudClient;
import com.rootrecord.minecraft.rootannouncer.cloud.SeasonSyncTask;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

public final class RootAnnouncerPlugin extends JavaPlugin implements SeasonSyncTask.RootAnnouncerPluginRef {

    private RootRecordYamlConfig yamlConfig;
    private AnnouncerConfig announcerConfig;
    private AnnouncerService announcer;
    private AnnouncerToggleStore toggles;
    private BukkitTask announceTask;
    private SeasonSyncTask seasonSync;
    private volatile List<String> seasonLines = List.of();

    @Override
    public void onEnable() {
        RootRecordFolders.ensureDir(this);
        RootRecordCloudConfig.ensureDefaults(this);
        yamlConfig = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_ANNOUNCER_CONFIG, "root-announcer.yml");
        yamlConfig.load();
        reloadLocalConfig();

        var adminCmd = getCommand("rootannouncer");
        if (adminCmd != null) {
            RootAnnouncerCommand handler = new RootAnnouncerCommand(this);
            adminCmd.setExecutor(handler);
            adminCmd.setTabCompleter(handler);
        }
        var toggleCmd = getCommand("announcer");
        if (toggleCmd != null) {
            AnnouncerToggleCommand toggleHandler = new AnnouncerToggleCommand(this);
            toggleCmd.setExecutor(toggleHandler);
            toggleCmd.setTabCompleter(toggleHandler);
        }

        startSeasonSync();
        startTask();
        getLogger().info("Root-Announcer enabled — " + effectiveLines().size() + " message(s), every "
                + announcerConfig.intervalSeconds() + "s.");
    }

    @Override
    public void onDisable() {
        stopSeasonSync();
        stopTask();
    }

    public void reloadLocalConfig() {
        if (yamlConfig != null) {
            yamlConfig.reload();
        }
        FileConfiguration cfg = yamlConfig != null ? yamlConfig.config() : null;
        announcerConfig = AnnouncerConfig.from(cfg);
        if (toggles == null) {
            toggles = new AnnouncerToggleStore(this);
        }
        announcer = new AnnouncerService(this);
        restartSeasonSync();
    }

    public List<String> effectiveLines() {
        List<String> base = announcerConfig.lines();
        if (seasonLines.isEmpty()) {
            return base;
        }
        if (!announcerConfig.seasonLinesFirst()) {
            List<String> merged = new ArrayList<>(base.size() + seasonLines.size());
            merged.addAll(base);
            merged.addAll(seasonLines);
            return List.copyOf(merged);
        }
        List<String> merged = new ArrayList<>(seasonLines.size() + base.size());
        merged.addAll(seasonLines);
        merged.addAll(base);
        return List.copyOf(merged);
    }

    @Override
    public void applySeasonLines(List<String> lines) {
        List<String> next = lines == null ? List.of() : List.copyOf(lines);
        if (next.equals(seasonLines)) {
            return;
        }
        seasonLines = next;
        Bukkit.getScheduler().runTask(this, () -> {
            getLogger().info("Season announcer lines updated (" + seasonLines.size() + ").");
            restartTask();
        });
    }

    private void startSeasonSync() {
        if (!announcerConfig.cloudSyncEnabled()) {
            return;
        }
        seasonSync = new SeasonSyncTask(this, new SeasonCloudClient(cloudSettings()));
        seasonSync.start(announcerConfig.cloudSyncIntervalMinutes());
        seasonSync.runSafe();
    }

    private void restartSeasonSync() {
        stopSeasonSync();
        startSeasonSync();
    }

    private void stopSeasonSync() {
        if (seasonSync != null) {
            seasonSync.stop();
            seasonSync = null;
        }
    }

    private RootRecordCloudConfig.CloudSettings cloudSettings() {
        return RootRecordCloudConfig.resolve(this, yamlConfig != null ? yamlConfig.config() : null);
    }

    @Override
    public JavaPlugin plugin() {
        return this;
    }

    @Override
    public org.bukkit.scheduler.BukkitScheduler scheduler() {
        return getServer().getScheduler();
    }

    @Override
    public Logger logger() {
        return getLogger();
    }

    public AnnouncerToggleStore toggles() {
        return toggles;
    }

    public void restartTask() {
        stopTask();
        startTask();
    }

    private void startTask() {
        if (!announcerConfig.enabled() || effectiveLines().isEmpty()) {
            return;
        }
        long ticks = announcerConfig.intervalSeconds() * 20L;
        announceTask = getServer().getScheduler().runTaskTimer(this, () -> announcer.tick(), ticks, ticks);
    }

    private void stopTask() {
        if (announceTask != null) {
            announceTask.cancel();
            announceTask = null;
        }
    }

    public AnnouncerConfig config() {
        return announcerConfig;
    }

    public AnnouncerService announcer() {
        return announcer;
    }

    public String formatLine(String body) {
        String text = body == null ? "" : body;
        text = text.replace("{online}", String.valueOf(Bukkit.getOnlinePlayers().size()));
        text = text.replace("{max}", String.valueOf(Bukkit.getMaxPlayers()));
        return colorize(announcerConfig.prefix() + text);
    }

    public String colorize(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "";
        }
        return ChatColor.translateAlternateColorCodes('&', raw);
    }

    public String msg(String key) {
        return colorize(rawMsg(key));
    }

    public String rawMsg(String key) {
        String prefix = yamlConfig.config().getString("messages.prefix", "&8[&6RootMC&8]&r ");
        String body = yamlConfig.config().getString("messages." + key, key);
        return prefix + body;
    }
}
