package com.rootrecord.minecraft.rootadmin.world;

import com.rootrecord.minecraft.rootadmin.RootAdminPlugin;
import org.bukkit.Bukkit;
import org.bukkit.World;
import org.bukkit.WorldBorder;
import org.bukkit.configuration.file.FileConfiguration;

public final class WorldBorderService {

    private final RootAdminPlugin plugin;

    public WorldBorderService(RootAdminPlugin plugin) {
        this.plugin = plugin;
    }

    public void applyFromConfig() {
        FileConfiguration cfg = plugin.getConfig();
        if (!cfg.getBoolean("world-border.enabled", false)) {
            return;
        }
        double centerX = cfg.getDouble("world-border.center-x", 0);
        double centerZ = cfg.getDouble("world-border.center-z", 0);
        int radius = Math.max(1, cfg.getInt("world-border.radius", 5000));
        int warningBlocks = Math.max(0, cfg.getInt("world-border.warning-blocks", 512));
        int warningTime = Math.max(0, cfg.getInt("world-border.warning-time-seconds", 15));
        double damage = Math.max(0, cfg.getDouble("world-border.damage-amount", 0));

        int applied = 0;
        for (String worldName : cfg.getStringList("world-border.worlds")) {
            World world = Bukkit.getWorld(worldName);
            if (world == null) {
                plugin.getLogger().warning("World border skipped unknown world: " + worldName);
                continue;
            }
            applyToWorld(world, centerX, centerZ, radius, warningBlocks, warningTime, damage);
            applied++;
        }
        if (applied > 0) {
            plugin.getLogger().info(
                    "World border set: radius ±" + radius + " (diameter " + (radius * 2L)
                            + ") at " + centerX + ", " + centerZ + " on " + applied + " world(s).");
        }
    }

    static void applyToWorld(
            World world,
            double centerX,
            double centerZ,
            int radius,
            int warningBlocks,
            int warningTime,
            double damage) {
        double diameter = radius * 2.0;
        if (world.getEnvironment() == World.Environment.NETHER) {
            diameter = diameter / 8.0;
        }
        WorldBorder border = world.getWorldBorder();
        border.setCenter(centerX, centerZ);
        border.setSize(Math.max(1.0, diameter));
        border.setWarningDistance(warningBlocks);
        border.setWarningTime(warningTime);
        border.setDamageAmount(damage);
        border.setDamageBuffer(0);
    }
}
