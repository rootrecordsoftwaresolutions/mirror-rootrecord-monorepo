package com.rootrecord.minecraft.rootclaims;

import org.bukkit.Location;
import org.bukkit.block.Block;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public final class ClaimRecord {

    private final ClaimKey key;
    private final UUID ownerId;
    private String ownerName;
    private final long createdAtMillis;
    private final double paidGold;
    private final int radiusBlocks;
    private final ClaimKey parentKey;
    /** Display name for the area (meaningful on roots). */
    private String displayName;
    private boolean mobsAllowed = false;
    /** When true, other players may use area spawn via /spawn. Default private. */
    private boolean spawnPublic = false;
    private Double spawnX;
    private Double spawnY;
    private Double spawnZ;
    private float spawnYaw;
    private float spawnPitch;
    private final Map<UUID, String> trusted = new LinkedHashMap<>();

    public ClaimRecord(
            ClaimKey key,
            UUID ownerId,
            String ownerName,
            long createdAtMillis,
            double paidGold,
            int radiusBlocks,
            ClaimKey parentKey) {
        this(key, ownerId, ownerName, createdAtMillis, paidGold, radiusBlocks, parentKey, false, false);
    }

    public ClaimRecord(
            ClaimKey key,
            UUID ownerId,
            String ownerName,
            long createdAtMillis,
            double paidGold,
            int radiusBlocks,
            ClaimKey parentKey,
            boolean mobsAllowed) {
        this(key, ownerId, ownerName, createdAtMillis, paidGold, radiusBlocks, parentKey, mobsAllowed, false);
    }

    public ClaimRecord(
            ClaimKey key,
            UUID ownerId,
            String ownerName,
            long createdAtMillis,
            double paidGold,
            int radiusBlocks,
            ClaimKey parentKey,
            boolean mobsAllowed,
            boolean spawnPublic) {
        this.key = key;
        this.ownerId = ownerId;
        this.ownerName = ownerName;
        this.createdAtMillis = createdAtMillis;
        this.paidGold = paidGold;
        this.radiusBlocks = radiusBlocks;
        this.parentKey = parentKey;
        this.mobsAllowed = mobsAllowed;
        this.spawnPublic = spawnPublic;
    }

    public ClaimKey key() {
        return key;
    }

    public UUID ownerId() {
        return ownerId;
    }

    public String ownerName() {
        return ownerName;
    }

    public void ownerName(String ownerName) {
        if (ownerName != null && !ownerName.isBlank()) {
            this.ownerName = ownerName;
        }
    }

    public long createdAtMillis() {
        return createdAtMillis;
    }

    public double paidGold() {
        return paidGold;
    }

    public int radiusBlocks() {
        return radiusBlocks;
    }

    public ClaimKey parentKey() {
        return parentKey;
    }

    public boolean isAreaRoot() {
        return parentKey == null;
    }

    public String displayName() {
        return displayName;
    }

    public void displayName(String displayName) {
        if (displayName != null && !displayName.isBlank()) {
            this.displayName = displayName.trim();
        }
    }

    /** Area label: stored name, else owner(slot-style) fallback. */
    public String areaNameOrOwner() {
        if (displayName != null && !displayName.isBlank()) {
            return displayName;
        }
        return ownerName == null || ownerName.isBlank() ? "Area" : ownerName;
    }

    public boolean mobsAllowed() {
        return mobsAllowed;
    }

    public void mobsAllowed(boolean mobsAllowed) {
        this.mobsAllowed = mobsAllowed;
    }

    public boolean spawnPublic() {
        return spawnPublic;
    }

    public void spawnPublic(boolean spawnPublic) {
        this.spawnPublic = spawnPublic;
    }

    public boolean hasCustomSpawn() {
        return spawnX != null && spawnY != null && spawnZ != null;
    }

    public Double spawnX() {
        return spawnX;
    }

    public Double spawnY() {
        return spawnY;
    }

    public Double spawnZ() {
        return spawnZ;
    }

    public float spawnYaw() {
        return spawnYaw;
    }

    public float spawnPitch() {
        return spawnPitch;
    }

    public void setSpawn(Location location) {
        if (location == null) {
            clearSpawn();
            return;
        }
        this.spawnX = location.getX();
        this.spawnY = location.getY();
        this.spawnZ = location.getZ();
        this.spawnYaw = location.getYaw();
        this.spawnPitch = location.getPitch();
    }

    public void setSpawn(double x, double y, double z, float yaw, float pitch) {
        this.spawnX = x;
        this.spawnY = y;
        this.spawnZ = z;
        this.spawnYaw = yaw;
        this.spawnPitch = pitch;
    }

    public void clearSpawn() {
        this.spawnX = null;
        this.spawnY = null;
        this.spawnZ = null;
        this.spawnYaw = 0f;
        this.spawnPitch = 0f;
    }

    public Map<UUID, String> trusted() {
        return trusted;
    }

    public UUID bankAccountUuid() {
        return UUID.nameUUIDFromBytes(("rootclaims:bank:" + key.storageId()).getBytes(StandardCharsets.UTF_8));
    }

    public String bankAccountName() {
        String compact = bankAccountUuid().toString().replace("-", "");
        return "claim-" + compact.substring(0, Math.min(26, compact.length()));
    }

    public String bankDisplayName() {
        return "Area " + areaNameOrOwner() + " (" + key.world() + " " + key.x() + "," + key.z() + ")";
    }

    public boolean canManage(UUID playerId) {
        return ownerId.equals(playerId) || trusted.containsKey(playerId);
    }

    public boolean trust(UUID playerId, String playerName) {
        if (ownerId.equals(playerId)) {
            return false;
        }
        trusted.put(playerId, playerName == null || playerName.isBlank() ? playerId.toString() : playerName);
        return true;
    }

    public boolean untrust(UUID playerId) {
        return trusted.remove(playerId) != null;
    }

    public boolean contains(Block block) {
        return block != null
                && key.world().equals(block.getWorld().getName())
                && horizontalDistanceSquared(block.getX(), block.getZ()) <= (double) radiusBlocks * radiusBlocks;
    }

    public boolean contains(Location location) {
        return location != null
                && location.getWorld() != null
                && key.world().equals(location.getWorld().getName())
                && horizontalDistanceSquared(location.getBlockX(), location.getBlockZ()) <= (double) radiusBlocks * radiusBlocks;
    }

    /**
     * Unclaimed wilderness band: outside the claim circle, within {@code bufferBlocks} of its edge.
     */
    public boolean containsTerritory(String worldName, int blockX, int blockZ, int bufferBlocks) {
        if (worldName == null || !key.world().equals(worldName) || bufferBlocks <= 0) {
            return false;
        }
        double distance = horizontalDistance(blockX, blockZ);
        return distance > radiusBlocks && distance <= radiusBlocks + bufferBlocks;
    }

    public double horizontalDistance(double x, double z) {
        return Math.sqrt(horizontalDistanceSquared(x, z));
    }

    private double horizontalDistanceSquared(double x, double z) {
        double dx = x - key.x();
        double dz = z - key.z();
        return dx * dx + dz * dz;
    }
}
