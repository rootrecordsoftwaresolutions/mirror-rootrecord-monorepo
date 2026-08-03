package com.rootrecord.minecraft.rootexplore;

import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import org.bukkit.ChatColor;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

public final class RootExplorePlugin extends JavaPlugin {

    private RootRecordYamlConfig yamlConfig;
    private ExploreConfig exploreConfig;
    private ExploreToggleStore toggles;
    private ExplorePlayerState playerState;
    private StructureLocateQueue structureQueue;

    @Override
    public void onEnable() {
        RootRecordFolders.ensureDir(this);
        yamlConfig = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_EXPLORE_CONFIG, "root-explore.yml");
        yamlConfig.load();
        reloadLocalConfig();

        var exploreCmd = getCommand("explore");
        if (exploreCmd != null) {
            ExploreCommand handler = new ExploreCommand(this);
            exploreCmd.setExecutor(handler);
            exploreCmd.setTabCompleter(handler);
        }

        getServer().getPluginManager().registerEvents(new ExploreListener(this, playerState), this);
        structureQueue.start();
        getLogger().info("Root-Explore enabled — server-accurate biome + structure hints.");
    }

    @Override
    public void onDisable() {
        if (structureQueue != null) {
            structureQueue.stop();
        }
    }

    public void reloadLocalConfig() {
        if (yamlConfig != null) {
            yamlConfig.reload();
        }
        exploreConfig = ExploreConfig.from(yamlConfig != null ? yamlConfig.config() : null);
        if (toggles == null) {
            toggles = new ExploreToggleStore(this);
        }
        if (playerState == null) {
            playerState = new ExplorePlayerState();
        }
        if (structureQueue == null) {
            structureQueue = new StructureLocateQueue(this, playerState);
        } else if (isEnabled()) {
            structureQueue.start();
        }
    }

    public ExploreConfig exploreConfig() {
        return exploreConfig != null ? exploreConfig : ExploreConfig.from(null);
    }

    public ExploreToggleStore toggles() {
        return toggles;
    }

    public boolean hintsEnabledFor(Player player) {
        return exploreConfig().enabled()
                && player.hasPermission("rootexplore.hints")
                && toggles.isEnabled(player.getUniqueId());
    }

    public String format(String body) {
        return colorize(exploreConfig().prefix() + (body == null ? "" : body));
    }

    public String msg(String key) {
        FileConfiguration cfg = yamlConfig != null ? yamlConfig.config() : null;
        String body = cfg != null ? cfg.getString("messages." + key, key) : key;
        return format(body);
    }

    public String colorize(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "";
        }
        return ChatColor.translateAlternateColorCodes('&', raw);
    }
}
