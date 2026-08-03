package com.rootrecord.minecraft.rootrestart;

import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.command.PluginCommandRegistrar;
import com.rootrecord.minecraft.common.command.ServerRestartBridge;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

public final class RootRestartPlugin extends JavaPlugin {

    private RootRecordYamlConfig yaml;
    private RestartConfig config;
    private RestartCountdown countdown;
    private DailyRestartScheduler dailyScheduler;

    @Override
    public void onEnable() {
        RootRecordFolders.ensureDir(this);
        yaml = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_RESTART_CONFIG, "root-restart.yml");
        yaml.load();
        reloadLocalConfig();
        RestartScriptInstaller.ensure(this);
        RestartScriptInstaller.verifySpigotConfig(this);

        AdminCommand handler = new AdminCommand(this);
        ServerRestartBridge.register(this, handler, handler);

        PluginCommand restartCmd = bindCommand(
                "rootrestart",
                "Graceful server restart with countdown",
                "/rootrestart [cancel]",
                List.of("rrrestart"),
                handler);
        PluginCommand stopCmd = bindCommand(
                "rootstop",
                "Graceful stop for update with countdown",
                "/rootstop [cancel]",
                List.of("rrstop"),
                handler);

        dailyScheduler = new DailyRestartScheduler(this);
        dailyScheduler.start();
        new ServerStartupNotifier(this).schedule();
        getLogger().info("Root-Restart enabled"
                + (restartCmd != null ? " - /rootrestart [cancel]" : " (restart cmd pending host)")
                + (stopCmd != null ? " - /rootstop [cancel]" : " (stop cmd pending host)")
                + ", daily midnight HST when enabled.");
    }

    private PluginCommand bindCommand(
            String name,
            String description,
            String usage,
            List<String> aliases,
            AdminCommand handler) {
        PluginCommand cmd = getCommand(name);
        if (cmd == null) {
            cmd = PluginCommandRegistrar.register(this, name, description, usage, aliases);
        }
        if (cmd != null) {
            cmd.setExecutor(handler);
            cmd.setTabCompleter(handler);
        } else {
            getLogger().severe("Could not register /" + name + " - Root-Admin may host it after enable.");
        }
        return cmd;
    }

    @Override
    public void onDisable() {
        ServerRestartBridge.unregister(this);
        if (dailyScheduler != null) {
            dailyScheduler.stop();
        }
        cancelCountdown();
    }

    public void reloadLocalConfig() {
        if (yaml != null) {
            yaml.reload();
        }
        config = RestartConfig.from(yaml.config());
        if (dailyScheduler != null) {
            dailyScheduler.stop();
            dailyScheduler.start();
        }
    }

    public RestartConfig config() {
        return config;
    }

    public RestartCountdown countdown() {
        return countdown;
    }

    public void startCountdown(RestartCountdown.Kind kind, String initiatorName) {
        if (countdown != null) {
            countdown.stop();
        }
        countdown = new RestartCountdown(this, kind, initiatorName);
        countdown.start();
    }

    public boolean cancelCountdown() {
        if (countdown == null || !countdown.isRunning()) {
            return false;
        }
        countdown.stop();
        countdown = null;
        return true;
    }

    void onCountdownFinished(RestartCountdown finished) {
        if (countdown != finished) {
            return;
        }
        RestartCountdown.Kind kind = finished.kind();
        countdown = null;

        if (kind == RestartCountdown.Kind.STOP) {
            finished.broadcastStoppingNow();
            org.bukkit.plugin.Plugin core = Bukkit.getPluginManager().getPlugin("Root-Core");
            if (core != null && core.isEnabled()) {
                try {
                    java.lang.reflect.Method m = core.getClass().getMethod("evacuateForRestart", Runnable.class);
                    m.invoke(core, (Runnable) () -> ServerStop.execute(this));
                    return;
                } catch (ReflectiveOperationException ex) {
                    getLogger().warning("Root-Core evacuateForRestart unavailable: " + ex.getMessage());
                }
            }
            ServerStop.execute(this);
            return;
        }

        finished.broadcastRestartingNow();
        org.bukkit.plugin.Plugin core = Bukkit.getPluginManager().getPlugin("Root-Core");
        if (core != null && core.isEnabled()) {
            try {
                java.lang.reflect.Method m = core.getClass().getMethod("evacuateForRestart", Runnable.class);
                m.invoke(core, (Runnable) () -> ServerRestart.execute(this));
                return;
            } catch (ReflectiveOperationException ex) {
                getLogger().warning("Root-Core evacuateForRestart unavailable: " + ex.getMessage());
            }
        }
        ServerRestart.execute(this);
    }

    public String colorize(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "";
        }
        return ChatColor.translateAlternateColorCodes('&', raw);
    }
}
