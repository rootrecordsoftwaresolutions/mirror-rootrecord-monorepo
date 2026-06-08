package com.rootrecord.minecraft.rootstat;

import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;
import com.rootrecord.minecraft.rootstat.config.RootStatConfig;
import com.rootrecord.minecraft.rootstat.mysql.McMMOStatsReader;
import com.rootrecord.minecraft.rootstat.mysql.MySqlPlayerStore;
import com.rootrecord.minecraft.rootstat.mysql.PlayerPlaytimeStore;
import com.rootrecord.minecraft.rootstat.sync.SyncTask;
import org.bukkit.plugin.Plugin;

/** Host for RootStat services — implemented by BlockNotes (merged) or legacy RootStatPlugin. */
public interface RootStatBridge {

    Plugin getPlugin();

    RootStatConfig config();

    CloudApiClient cloud();

    MySqlPlayerStore players();

    McMMOStatsReader mcmmo();

    PlayerPlaytimeStore playtime();

    SyncTask syncTask();

    String msg(String key);

    void reloadRootStatConfig();

    default String colorize(String input) {
        return input == null ? "" : input.replace('&', '\u00A7');
    }
}
