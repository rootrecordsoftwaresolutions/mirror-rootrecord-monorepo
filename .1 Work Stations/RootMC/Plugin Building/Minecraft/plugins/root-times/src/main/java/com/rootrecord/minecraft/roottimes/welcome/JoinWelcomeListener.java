package com.rootrecord.minecraft.roottimes.welcome;

import com.rootrecord.minecraft.common.ChatUi;
import com.rootrecord.minecraft.common.FancyHeadlines;
import com.rootrecord.minecraft.common.McDayClock;
import com.rootrecord.minecraft.common.RootMcServerDisplay;
import com.rootrecord.minecraft.roottimes.RootTimesPlugin;
import com.rootrecord.minecraft.roottimes.clock.ClockService;
import com.rootrecord.minecraft.roottimes.mysql.ActivityHarvestStore;
import com.rootrecord.minecraft.roottimes.mysql.PlaytimeStore;
import com.rootrecord.minecraft.roottimes.timezone.PlayerTimezone;
import org.bukkit.Bukkit;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.HandlerList;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Collections;
import java.util.Map;
import java.util.UUID;

@SuppressWarnings("deprecation")
public final class JoinWelcomeListener implements Listener {

    private final RootTimesPlugin plugin;

    public JoinWelcomeListener(RootTimesPlugin plugin) {
        this.plugin = plugin;
    }

    public void start() {
        stop();
        if (!plugin.timesConfig().welcomeEnabled()) {
            return;
        }
        Bukkit.getPluginManager().registerEvents(this, plugin);
    }

    public void stop() {
        HandlerList.unregisterAll(this);
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        if (!plugin.timesConfig().welcomeEnabled()) {
            return;
        }
        Player player = event.getPlayer();
        int delay = plugin.timesConfig().welcomeDelayTicks();
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (!player.isOnline()) {
                return;
            }
            Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> sendWelcome(player));
        }, delay);
    }

    private void sendWelcome(Player player) {
        UUID uuid = player.getUniqueId();
        long totalSeconds = 0L;
        Map<String, Long> serverScopes = Collections.emptyMap();
        String tzKey = plugin.timesConfig().defaultTimezoneKey();
        if (plugin.mysql().ready()) {
            try (var c = plugin.mysql().open()) {
                totalSeconds = PlaytimeStore.totalSeconds(c, plugin.timesConfig(), uuid).orElse(0L);
                serverScopes = PlaytimeStore.serverScopeSeconds(c, plugin.timesConfig(), uuid);
                tzKey = ActivityHarvestStore.getTimezoneKey(c, plugin.timesConfig(), uuid).orElse(tzKey);
            } catch (Exception ex) {
                plugin.getLogger().warning("Welcome playtime lookup failed: " + ex.getMessage());
            }
        }
        PlayerTimezone tz = PlayerTimezone.byKey(tzKey).orElse(PlayerTimezone.utc());
        ZonedDateTime local = Instant.now().atZone(ZoneOffset.ofTotalSeconds(tz.offsetMinutes() * 60));
        String clock = format12h(local);
        String playtime = PlaytimeStore.formatDuration(totalSeconds);
        long scheduleDay = McDayClock.enabled() ? McDayClock.currentDayId() : 0L;

        String tzLabel = tz.label();
        String playtimeFmt = playtime;
        String clockFmt = clock;
        long scheduleDayFinal = scheduleDay;
        Map<String, Long> scopesFinal = serverScopes;

        Bukkit.getScheduler().runTask(plugin, () -> {
            if (!player.isOnline()) {
                return;
            }
            World world = plugin.worldTimeSync() != null
                    ? plugin.worldTimeSync().dayWorld()
                    : null;
            long fullTime = world != null ? world.getFullTime() : 0L;
            long todTicks = Math.floorMod(fullTime, McDayClock.TICKS_PER_DAY);
            long worldDay = Math.floorDiv(fullTime, McDayClock.TICKS_PER_DAY);
            String phase = ClockService.phaseLabel(todTicks);
            long displayDay = scheduleDayFinal > 0 ? scheduleDayFinal : worldDay;

            FancyHeadlines.sendBanner(player, RootMcServerDisplay.serverName(plugin));
            ChatUi.entry(player, "Playtime", playtimeFmt);
            if (scopesFinal != null && !scopesFinal.isEmpty()) {
                long towny = scopesFinal.getOrDefault(PlaytimeStore.SCOPE_TOWNY, 0L);
                long claims = scopesFinal.getOrDefault(PlaytimeStore.SCOPE_CLAIMS, 0L);
                if (towny > 0L || claims > 0L) {
                    ChatUi.entry(
                            player,
                            "Servers",
                            "Towny " + PlaytimeStore.formatDuration(towny)
                                    + " · Claims " + PlaytimeStore.formatDuration(claims));
                }
            }
            ChatUi.entry(player, "Local", clockFmt + " " + tzLabel);
            ChatUi.entry(player, "Day", "#" + displayDay + " · " + phase);
            ChatUi.tip(player, "/playtime  ·  /cmds  ·  /vote  ·  /try");
        });
    }

    private static String format12h(ZonedDateTime local) {
        int hour24 = local.getHour();
        int minute = local.getMinute();
        String ampm = hour24 >= 12 ? "PM" : "AM";
        int hour12 = hour24 % 12;
        if (hour12 == 0) {
            hour12 = 12;
        }
        return hour12 + ":" + String.format("%02d", minute) + " " + ampm;
    }
}
