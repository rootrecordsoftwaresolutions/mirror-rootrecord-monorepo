package com.rootrecord.minecraft.rootavacore.presence;

import com.destroystokyo.paper.profile.ProfileProperty;
import com.rootrecord.minecraft.rootavacore.AvaConfig;
import com.rootrecord.minecraft.rootavacore.RootAvaCorePlugin;
import io.papermc.paper.datacomponent.item.ResolvableProfile;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.attribute.Attribute;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Mannequin;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.Vector;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Phase 1 presence shell — Paper Mannequin body near spawn.
 * No speech brain, no grief tools, spawn-radius wander only.
 */
public final class AvaPresenceService {

    public static final String BODY_MARKER = "ava_presence_body";

    private final RootAvaCorePlugin plugin;
    private final NamespacedKey bodyKey;
    private Mannequin body;
    private Location anchor;
    private BukkitTask wanderTask;
    private String activeStack = "none";

    public AvaPresenceService(RootAvaCorePlugin plugin) {
        this.plugin = plugin;
        this.bodyKey = new NamespacedKey(plugin, BODY_MARKER);
    }

    public NamespacedKey bodyKey() {
        return bodyKey;
    }

    public boolean isAvaBody(Entity entity) {
        if (entity == null) return false;
        return entity.getPersistentDataContainer().has(bodyKey, PersistentDataType.BYTE);
    }

    public Mannequin body() {
        return body;
    }

    public Location anchor() {
        return anchor == null ? null : anchor.clone();
    }

    public String activeStack() {
        return activeStack;
    }

    public boolean isSpawned() {
        return body != null && body.isValid() && !body.isDead();
    }

    public void startIfEnabled() {
        stop();
        AvaConfig.PresenceConfig cfg = plugin.config().presence();
        if (!plugin.config().enabled() || !cfg.enabled()) {
            plugin.getLogger().info("Ava presence idle (disabled in config).");
            return;
        }
        Location spawnAt = resolveAnchor(cfg, null);
        if (spawnAt == null) {
            plugin.getLogger().warning("Ava presence: no world/spawn — not spawning.");
            return;
        }
        spawnAt(spawnAt, cfg);
    }

    public boolean spawnHere(Location loc) {
        AvaConfig.PresenceConfig cfg = plugin.config().presence();
        if (!cfg.enabled()) return false;
        if (loc == null || loc.getWorld() == null) return false;
        stop();
        spawnAt(loc.clone(), cfg);
        return isSpawned();
    }

    public void despawn() {
        stop();
    }

    public void reload() {
        boolean was = isSpawned();
        Location keep = was && body != null ? body.getLocation().clone() : null;
        stop();
        AvaConfig.PresenceConfig cfg = plugin.config().presence();
        if (!plugin.config().enabled() || !cfg.enabled()) {
            return;
        }
        if (keep != null) {
            spawnAt(keep, cfg);
        } else {
            startIfEnabled();
        }
    }

    public void stop() {
        if (wanderTask != null) {
            wanderTask.cancel();
            wanderTask = null;
        }
        if (body != null) {
            try {
                body.remove();
            } catch (Throwable ignored) {
                // Soft cleanup
            }
            body = null;
        }
        // Sweep orphaned markers from prior crashes
        for (World world : Bukkit.getWorlds()) {
            for (Entity e : world.getEntities()) {
                if (isAvaBody(e)) {
                    e.remove();
                }
            }
        }
        activeStack = "none";
    }

    private void spawnAt(Location loc, AvaConfig.PresenceConfig cfg) {
        World world = loc.getWorld();
        if (world == null) return;

        // Prefer FancyNpcs if operator installed it and stack requests it
        if ("fancynpcs".equalsIgnoreCase(cfg.stack())
                && Bukkit.getPluginManager().getPlugin("FancyNpcs") != null) {
            plugin.getLogger().warning(
                    "Ava presence: FancyNpcs detected but Phase 1 uses native Mannequin. "
                            + "Set presence.stack: native-mannequin (default). FancyNpcs bridge is Phase 2.");
        }

        Location safe = loc.clone();
        safe.setPitch(0f);
        Mannequin spawned = world.spawn(safe, Mannequin.class, m -> applyBody(m, cfg));
        this.body = spawned;
        this.anchor = safe.clone();
        this.activeStack = "native-mannequin";
        startWander(cfg);
        plugin.getLogger().info(
                "Ava presence spawned (" + activeStack + ") at "
                        + world.getName() + " "
                        + Math.round(safe.getX()) + ","
                        + Math.round(safe.getY()) + ","
                        + Math.round(safe.getZ()));
    }

    private void applyBody(Mannequin m, AvaConfig.PresenceConfig cfg) {
        m.getPersistentDataContainer().set(bodyKey, PersistentDataType.BYTE, (byte) 1);
        m.customName(LegacyComponentSerializer.legacyAmpersand().deserialize(cfg.displayName()));
        m.setCustomNameVisible(true);
        m.setDescription(LegacyComponentSerializer.legacyAmpersand().deserialize("&7RootMC lead-dev"));
        m.setImmovable(false);
        m.setCollidable(false);
        m.setSilent(true);
        m.setRemoveWhenFarAway(false);
        m.setCanPickupItems(false);
        m.setInvulnerable(cfg.invulnerable());
        m.setGravity(true);
        m.setAI(false);
        try {
            var maxHealth = m.getAttribute(Attribute.MAX_HEALTH);
            if (maxHealth != null) {
                maxHealth.setBaseValue(20.0);
            }
            m.setHealth(20.0);
        } catch (Throwable ignored) {
            // Soft
        }
        if (m.getEquipment() != null) {
            m.getEquipment().clear();
        }
        applySkin(m, cfg);
    }

    private void applySkin(Mannequin m, AvaConfig.PresenceConfig cfg) {
        String skinName = cfg.skinName();
        if (skinName == null || skinName.isBlank()) {
            skinName = "AvaIvy";
        }
        if (skinName.length() > 16) {
            skinName = skinName.substring(0, 16);
        }
        UUID uuid = UUID.nameUUIDFromBytes(("RootAvaPresence:" + skinName).getBytes(StandardCharsets.UTF_8));
        ResolvableProfile.Builder builder = ResolvableProfile.resolvableProfile()
                .name(skinName)
                .uuid(uuid);
        String texture = cfg.skinTexture();
        if (texture != null && !texture.isBlank()) {
            builder.addProperty(new ProfileProperty("textures", texture.trim()));
        }
        m.setProfile(builder.build());
    }

    private void startWander(AvaConfig.PresenceConfig cfg) {
        if (wanderTask != null) {
            wanderTask.cancel();
            wanderTask = null;
        }
        if (!cfg.wanderEnabled() || cfg.wanderRadius() <= 0) {
            return;
        }
        long interval = Math.max(40L, cfg.wanderIntervalTicks());
        wanderTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> tickWander(cfg), interval, interval);
    }

    private void tickWander(AvaConfig.PresenceConfig cfg) {
        if (!isSpawned() || anchor == null) return;
        Location here = body.getLocation();
        // Idle look: slight yaw drift
        float yaw = here.getYaw() + ThreadLocalRandom.current().nextFloat(-25f, 25f);
        here.setYaw(yaw);
        body.setRotation(yaw, 0f);

        // Occasional small step within radius
        if (ThreadLocalRandom.current().nextDouble() > 0.55) {
            return;
        }
        double radius = cfg.wanderRadius();
        double ox = ThreadLocalRandom.current().nextDouble(-radius, radius);
        double oz = ThreadLocalRandom.current().nextDouble(-radius, radius);
        Location target = anchor.clone().add(ox, 0, oz);
        target.setY(anchor.getY());
        // Keep feet on ground-ish
        Location ground = findStand(target);
        if (ground == null) return;
        if (ground.distanceSquared(anchor) > radius * radius) {
            ground = anchor.clone();
        }
        body.teleport(ground);
        // Face travel direction lightly
        Vector dir = ground.toVector().subtract(here.toVector());
        if (dir.lengthSquared() > 0.01) {
            Location look = ground.clone().setDirection(dir);
            body.setRotation(look.getYaw(), 0f);
        }
    }

    private static Location findStand(Location approx) {
        World world = approx.getWorld();
        if (world == null) return null;
        Location probe = approx.clone();
        // Prefer solid underfoot within a few blocks
        for (int dy = 0; dy <= 3; dy++) {
            Location at = probe.clone().add(0, -dy, 0);
            Location below = at.clone().add(0, -1, 0);
            if (!at.getBlock().isPassable()) continue;
            if (below.getBlock().getType().isAir()) continue;
            if (!below.getBlock().getType().isSolid()) continue;
            at.setYaw(approx.getYaw());
            at.setPitch(0f);
            return at;
        }
        return approx;
    }

    private Location resolveAnchor(AvaConfig.PresenceConfig cfg, Location preferred) {
        if (preferred != null && preferred.getWorld() != null) {
            return preferred.clone();
        }
        if (!cfg.useWorldSpawn() && cfg.world() != null && !cfg.world().isBlank()) {
            World w = Bukkit.getWorld(cfg.world());
            if (w != null) {
                return new Location(w, cfg.x(), cfg.y(), cfg.z(), cfg.yaw(), 0f);
            }
        }
        String worldName = cfg.world();
        World world = worldName != null && !worldName.isBlank()
                ? Bukkit.getWorld(worldName)
                : Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
        if (world == null) return null;
        if (cfg.useWorldSpawn()) {
            Location spawn = world.getSpawnLocation().clone();
            spawn.setYaw(cfg.yaw());
            spawn.setPitch(0f);
            return spawn;
        }
        return new Location(world, cfg.x(), cfg.y(), cfg.z(), cfg.yaw(), 0f);
    }
}
