package com.rootrecord.minecraft.common;

import org.bukkit.plugin.Plugin;

import java.io.File;

/** Shared on-disk layout for all RootRecord Paper plugins. */
public final class RootRecordFolders {

    public static final String FOLDER_NAME = "RootRecord";

    public static final String CLOUD_CONFIG = "cloud.yml";
    public static final String ROOTSTAT_CONFIG = "rootstat.yml";
    public static final String BLOCKNOTES_CONFIG = "blocknotes.yml";
    public static final String DOWNLOADED_PLUGINS_STATE = "downloaded-plugins.yml";

    private RootRecordFolders() {}

    /** {@code plugins/RootRecord/} — configs and internal state, not per-plugin subfolders. */
    public static File dir(Plugin plugin) {
        return new File(pluginsDir(plugin), FOLDER_NAME);
    }

    public static File pluginsDir(Plugin plugin) {
        return plugin.getServer().getPluginsFolder();
    }

    /** {@code plugins/RootRecord/<fileName>} e.g. {@code rootstat.yml}. */
    public static File configFile(Plugin plugin, String fileName) {
        return new File(dir(plugin), fileName);
    }

    public static void ensureDir(Plugin plugin) {
        dir(plugin).mkdirs();
    }
}
