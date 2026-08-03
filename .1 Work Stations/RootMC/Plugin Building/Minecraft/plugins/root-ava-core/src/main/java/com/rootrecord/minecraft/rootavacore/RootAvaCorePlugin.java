package com.rootrecord.minecraft.rootavacore;

import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.command.PluginCommandRegistrar;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootavacore.presence.AvaPresenceService;
import com.rootrecord.minecraft.rootavacore.presence.PresenceSafetyListener;
import org.bukkit.ChatColor;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

/**
 * Thin Ava companion — status signals + optional Phase 1 presence shell.
 * No economy edits, bans, or cross-server credential sharing.
 */
public final class RootAvaCorePlugin extends JavaPlugin {

    private RootRecordYamlConfig yaml;
    private AvaConfig config;
    private AvaPresenceService presence;

    @Override
    public void onEnable() {
        RootRecordFolders.ensureDir(this);
        yaml = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_AVA_CORE_CONFIG, "root-ava-core.yml");
        yaml.load();
        config = new AvaConfig(yaml.config());

        presence = new AvaPresenceService(this);
        getServer().getPluginManager().registerEvents(new PresenceSafetyListener(this, presence), this);
        bindAvaCommand();
        bindSolarCommand();

        // Defer one tick so worlds are ready
        getServer().getScheduler().runTask(this, () -> presence.startIfEnabled());

        getLogger().info("Ava companion loaded (Root-Ava-Core v" + getDescription().getVersion() + ").");
    }

    @Override
    public void onDisable() {
        if (presence != null) {
            presence.stop();
        }
    }

    public void reloadAll() {
        yaml.load();
        config = new AvaConfig(yaml.config());
        if (presence != null) {
            presence.reload();
        }
        getLogger().info("Root-Ava-Core reloaded.");
    }

    public AvaConfig config() {
        return config;
    }

    public AvaPresenceService presence() {
        return presence;
    }

    private void bindAvaCommand() {
        PluginCommand cmd = getCommand("ava");
        if (cmd == null) {
            cmd = PluginCommandRegistrar.register(
                    this,
                    "ava",
                    "Show Ava companion status",
                    "/ava [army|tip|pulse|rollcall|presence|help|reload]",
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

    private void bindSolarCommand() {
        PluginCommand cmd = getCommand("solar");
        if (cmd == null) {
            cmd = PluginCommandRegistrar.register(
                    this,
                    "solar",
                    "HI Pacific Solar Root Server — live power + weather",
                    "/solar",
                    List.of());
        }
        if (cmd == null) {
            getLogger().severe("Could not bind /solar — command missing from plugin.yml and CommandMap fallback failed.");
            return;
        }
        cmd.setExecutor(new SolarCommand(this));
        cmd.setPermission("rootavacore.use");
    }

    @SuppressWarnings("deprecation")
    public String colorize(String input) {
        return ChatColor.translateAlternateColorCodes('&', input == null ? "" : input);
    }
}
