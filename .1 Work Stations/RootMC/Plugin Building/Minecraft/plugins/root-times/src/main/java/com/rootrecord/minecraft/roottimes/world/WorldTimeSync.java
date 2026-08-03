package com.rootrecord.minecraft.roottimes.world;

import com.rootrecord.minecraft.common.McDayClock;
import com.rootrecord.minecraft.roottimes.RootTimesPlugin;
import org.bukkit.Bukkit;
import org.bukkit.GameRule;
import org.bukkit.World;
import org.bukkit.event.EventHandler;
import org.bukkit.event.HandlerList;
import org.bukkit.event.Listener;
import org.bukkit.event.world.WorldLoadEvent;
import org.bukkit.scheduler.BukkitTask;

/** Drives world full-time from McDayClock; pauses while the server is empty. */
public final class WorldTimeSync implements Listener {

    private final RootTimesPlugin plugin;
    private BukkitTask task;
    private long virtualFullTime = -1L;
    private long lastActiveMillis = -1L;

    public WorldTimeSync(RootTimesPlugin plugin) {
        this.plugin = plugin;
    }

    public void start() {
        stop();
        if (!McDayClock.enabled()) {
            return;
        }
        Bukkit.getPluginManager().registerEvents(this, plugin);
        World world = resolveDayWorld();
        if (world != null) {
            world.setGameRule(GameRule.DO_DAYLIGHT_CYCLE, false);
            world.setGameRule(GameRule.PLAYERS_SLEEPING_PERCENTAGE, 101);
            virtualFullTime = world.getFullTime();
            apply(world, !Bukkit.getOnlinePlayers().isEmpty());
            applyGrowth(world, !Bukkit.getOnlinePlayers().isEmpty());
        }
        task = Bukkit.getScheduler().runTaskTimer(plugin, this::tick, 20L, 20L);
        plugin.getLogger().info(
                "World time sync active — "
                        + McDayClock.lengthMinutes()
                        + " min/day ("
                        + McDayClock.zone().getId()
                        + ")");
    }

    public void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }
        lastActiveMillis = -1L;
        HandlerList.unregisterAll(this);
    }

    private void tick() {
        World world = resolveDayWorld();
        if (world == null) {
            return;
        }
        boolean active = !Bukkit.getOnlinePlayers().isEmpty();
        apply(world, active);
        applyGrowth(world, active);
    }

    private void apply(World world, boolean active) {
        if (virtualFullTime < 0) {
            virtualFullTime = world.getFullTime();
        }
        if (active) {
            long now = System.currentTimeMillis();
            if (lastActiveMillis > 0) {
                long elapsedMillis = Math.max(0L, now - lastActiveMillis);
                long elapsedTicks = Math.max(
                        1L,
                        Math.round(elapsedMillis
                                * (McDayClock.TICKS_PER_DAY / (McDayClock.lengthMinutes() * 60_000.0))));
                virtualFullTime += elapsedTicks;
            }
            lastActiveMillis = now;
        } else {
            virtualFullTime = world.getFullTime();
            lastActiveMillis = -1L;
        }
        world.setFullTime(virtualFullTime);
        world.setGameRule(GameRule.DO_DAYLIGHT_CYCLE, false);
        world.setGameRule(GameRule.PLAYERS_SLEEPING_PERCENTAGE, 101);
    }

    private void applyGrowth(World world, boolean active) {
        if (!McDayClock.enabled()) {
            return;
        }
        world.setGameRule(GameRule.RANDOM_TICK_SPEED, active ? McDayClock.randomTickSpeed() : 0);
    }

    @EventHandler
    public void onWorldLoad(WorldLoadEvent event) {
        if (McDayClock.enabled()) {
            applyGrowth(event.getWorld(), !Bukkit.getOnlinePlayers().isEmpty());
        }
    }

    /** Overworld (or configured) world used for daylight sync / welcome world-day. */
    public World dayWorld() {
        return resolveDayWorld();
    }

    private World resolveDayWorld() {
        String named = plugin.timesConfig().dayWorld();
        if (named != null && !named.isBlank()) {
            World world = Bukkit.getWorld(named);
            if (world != null) {
                return world;
            }
        }
        for (World world : Bukkit.getWorlds()) {
            if (world.getEnvironment() == World.Environment.NORMAL) {
                return world;
            }
        }
        return Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().getFirst();
    }
}
