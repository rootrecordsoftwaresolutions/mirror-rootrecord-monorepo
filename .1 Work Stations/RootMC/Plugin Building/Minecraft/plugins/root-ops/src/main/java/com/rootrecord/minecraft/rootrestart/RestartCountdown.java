package com.rootrecord.minecraft.rootrestart;

import com.rootrecord.minecraft.common.FancyHeadlines;
import org.bukkit.Bukkit;
import org.bukkit.scheduler.BukkitTask;

import java.util.Set;

/** One-second tick countdown with milestone broadcasts. */
public final class RestartCountdown {

    private final RootRestartPlugin plugin;
    private final RestartKind kind;
    private final Set<Integer> warnings;
    private final int totalSeconds;
    private final String initiatorName;
    private int remaining;
    private BukkitTask task;

    public RestartCountdown(RootRestartPlugin plugin, RestartKind kind, String initiatorName) {
        this.plugin = plugin;
        this.kind = kind;
        this.initiatorName = initiatorName == null ? "" : initiatorName;
        this.warnings = RestartConfig.warningSeconds(kind);
        this.totalSeconds = RestartConfig.totalSeconds(kind);
        this.remaining = totalSeconds;
    }

    public RestartKind kind() {
        return kind;
    }

    public boolean isRunning() {
        return task != null && !task.isCancelled();
    }

    public void start() {
        stop();
        remaining = totalSeconds;
        tick();
        task = Bukkit.getScheduler().runTaskTimer(plugin.host(), this::tick, 20L, 20L);
    }

    public void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }
    }

    private void tick() {
        if (warnings.contains(remaining)) {
            broadcastWarning(remaining);
        }
        if (remaining <= 0) {
            stop();
            plugin.onCountdownFinished(this);
            return;
        }
        remaining--;
    }

    private void broadcastWarning(int seconds) {
        RestartConfig cfg = plugin.config();
        String body = switch (kind) {
            case DAILY -> cfg.dailyCountdownMsg();
            case STOP -> cfg.stopCountdownMsg();
            case UPDATE -> cfg.updateCountdownMsg();
            case MANUAL -> cfg.countdownMsg();
        };
        body = body.replace("{time}", RestartMessages.formatDuration(seconds));
        String line = plugin.colorize(prefixFor(cfg) + body);
        String headline = switch (kind) {
            case DAILY -> "Daily restart";
            case STOP -> "Server stop";
            case UPDATE -> "Plugin update";
            case MANUAL -> "Server restart";
        };
        Bukkit.getOnlinePlayers().forEach(p -> FancyHeadlines.sendAlert(p, headline));
        Bukkit.broadcastMessage(line);
        plugin.getLogger().info(RestartMessages.stripColor(line) + " (" + kind.name().toLowerCase() + ")");
        RestartDiscordRelay.relay(plugin, line);
    }

    void broadcastRestartingNow() {
        RestartConfig cfg = plugin.config();
        String line = plugin.colorize(cfg.prefix() + cfg.restartingNowMsg());
        Bukkit.getOnlinePlayers().forEach(p -> FancyHeadlines.sendAlert(p, "Restarting now"));
        Bukkit.broadcastMessage(line);
        plugin.getLogger().info(RestartMessages.stripColor(line));
        RestartDiscordRelay.relay(plugin, line);
    }

    void broadcastStoppingNow() {
        RestartConfig cfg = plugin.config();
        String line = plugin.colorize(cfg.stopPrefix() + cfg.stoppingNowMsg());
        Bukkit.getOnlinePlayers().forEach(p -> FancyHeadlines.sendAlert(p, "Stopping now"));
        Bukkit.broadcastMessage(line);
        plugin.getLogger().info(RestartMessages.stripColor(line));
        RestartDiscordRelay.relay(plugin, line);
    }

    private String prefixFor(RestartConfig cfg) {
        return switch (kind) {
            case STOP -> cfg.stopPrefix();
            case UPDATE -> cfg.updatePrefix();
            default -> cfg.prefix();
        };
    }
}
