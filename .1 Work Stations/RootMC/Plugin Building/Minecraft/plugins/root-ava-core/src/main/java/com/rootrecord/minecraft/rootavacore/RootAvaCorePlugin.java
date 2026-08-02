package com.rootrecord.minecraft.rootavacore;

import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.command.PluginCommandRegistrar;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import org.bukkit.ChatColor;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

/**
 * Thin Ava companion — read-only / soft status signals only.
 * No economy edits, bans, or cross-server credential sharing.
 */
public final class RootAvaCorePlugin extends JavaPlugin {

    private RootRecordYamlConfig yaml;
    private AvaConfig config;

    @Override
    public void onEnable() {
        RootRecordFolders.ensureDir(this);
        yaml = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_AVA_CORE_CONFIG, "root-ava-core.yml");
        yaml.load();
        config = new AvaConfig(yaml.config());

        bindAvaCommand();

        getLogger().info("Ava companion loaded (Root-Ava-Core v" + getDescription().getVersion() + ").");
    }

    public void reloadAll() {
        yaml.load();
        config = new AvaConfig(yaml.config());
        getLogger().info("Root-Ava-Core reloaded.");
    }

    public AvaConfig config() {
        return config;
    }

    private void bindAvaCommand() {
        PluginCommand cmd = getCommand("ava");
        if (cmd == null) {
            cmd = PluginCommandRegistrar.register(
                    this,
                    "ava",
                    "Show Ava companion status",
                    "/ava [army|tip|pulse|help|reload]",
                    List.of());
        }
        if (cmd == null) {
            getLogger().severe("Could not bind /ava — command missing from plugin.yml and CommandMap fallback failed.");
            return;
        }
        AvaCommand handler = new AvaCommand(this);
        cmd.setExecutor(handler);
        cmd.setTabCompleter(handler);
    }

    @SuppressWarnings("deprecation")
    public String colorize(String input) {
        return ChatColor.translateAlternateColorCodes('&', input == null ? "" : input);
    }
}
