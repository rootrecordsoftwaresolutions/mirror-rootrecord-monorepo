package com.rootrecord.minecraft.rootadmin.rails;

import com.rootrecord.minecraft.rootadmin.RootAdminPlugin;
import com.rootrecord.minecraft.rootadmin.util.AdminPermissions;
import org.bukkit.GameMode;
import org.bukkit.block.Block;
import org.bukkit.block.BlockFace;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;

public final class RailProtectionListener implements Listener {

    private final RootAdminPlugin plugin;
    private final RailOwnershipStore store;

    public RailProtectionListener(RootAdminPlugin plugin, RailOwnershipStore store) {
        this.plugin = plugin;
        this.store = store;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onRailPlace(BlockPlaceEvent event) {
        if (!plugin.railsEnabled()) {
            return;
        }
        Block placed = event.getBlockPlaced();
        if (!RailMaterials.isRail(placed.getType())) {
            return;
        }
        Player player = event.getPlayer();
        store.track(placed, player.getUniqueId(), player.getName());
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        if (!plugin.railsEnabled()) {
            return;
        }
        Player player = event.getPlayer();
        if (player.getGameMode() == GameMode.SPECTATOR) {
            return;
        }
        if (canBypass(player)) {
            Block block = event.getBlock();
            if (RailMaterials.isRail(block.getType())) {
                store.forget(block);
            }
            Block railAbove = block.getRelative(BlockFace.UP);
            if (RailMaterials.isRail(railAbove.getType())) {
                store.forget(railAbove);
            }
            return;
        }

        Block block = event.getBlock();
        if (RailMaterials.isRail(block.getType())) {
            if (denyIfProtected(player, block, event)) {
                return;
            }
            store.forget(block);
            return;
        }

        Block railAbove = block.getRelative(BlockFace.UP);
        if (!RailMaterials.isRail(railAbove.getType())) {
            return;
        }
        denyIfProtected(player, railAbove, event);
    }

    private boolean denyIfProtected(Player breaker, Block railBlock, BlockBreakEvent event) {
        RailOwnershipStore.Owner owner = store.ownerOf(railBlock);
        if (owner == null) {
            if (plugin.railsProtectUnknown()) {
                event.setCancelled(true);
                plugin.sendRailDenyMessage(breaker, "Unknown");
                return true;
            }
            return false;
        }
        if (owner.uuid().equals(breaker.getUniqueId())) {
            return false;
        }
        event.setCancelled(true);
        plugin.sendRailDenyMessage(breaker, owner.name());
        return true;
    }

    private boolean canBypass(Player player) {
        return AdminPermissions.has(player, "rails.bypass");
    }
}
