package com.rootrecord.minecraft.common;

import org.bukkit.plugin.Plugin;

import java.io.File;

/** Shared on-disk layout for all RootRecord Paper plugins. */
public final class RootRecordFolders {

    public static final String FOLDER_NAME = "RootRecord";

    public static final String CLOUD_CONFIG = "cloud.yml";
    public static final String ROOTMC_CONFIG = "rootmc.yml";
    public static final String ROOTMC_SHOPS_CONFIG = "rootmc-shops.yml";
    public static final String ROOTMC_SHOPS_LISTINGS = "shops.yml";
    public static final String ROOTHELP_CONFIG = "roothelp.yml";
    public static final String ROOT_ESSENTIALS_CONFIG = "root-essentials.yml";
    public static final String ROOT_REWARDS_CONFIG = "root-rewards.yml";
    public static final String ROOT_ANNOUNCER_CONFIG = "root-announcer.yml";
    public static final String ROOT_EXPLORE_CONFIG = "root-explore.yml";
    public static final String ROOT_ADMIN_CONFIG = "root-admin.yml";
    public static final String ROOT_LOANS_CONFIG = "root-loans.yml";
    public static final String ROOT_CONTRACTS_CONFIG = "root-contracts.yml";
    public static final String ROOT_BLUEPRINTS_CONFIG = "root-blueprints.yml";
    public static final String DOWNLOADED_PLUGINS_STATE = "downloaded-plugins.yml";

    private RootRecordFolders() {}

    /** {@code plugins/RootRecord/} — configs and internal state, not per-plugin subfolders. */
    public static File dir(Plugin plugin) {
        return new File(pluginsDir(plugin), FOLDER_NAME);
    }

    public static File pluginsDir(Plugin plugin) {
        return plugin.getServer().getPluginsFolder();
    }

    /** {@code plugins/RootRecord/<fileName>} e.g. {@code rootmc.yml}. */
    public static File configFile(Plugin plugin, String fileName) {
        return new File(dir(plugin), fileName);
    }

    public static void ensureDir(Plugin plugin) {
        dir(plugin).mkdirs();
    }
}
