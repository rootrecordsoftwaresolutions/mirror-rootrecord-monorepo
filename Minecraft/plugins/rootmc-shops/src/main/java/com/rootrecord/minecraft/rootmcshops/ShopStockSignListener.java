package com.rootrecord.minecraft.rootmcshops;

import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryCloseEvent;

/** Keeps shop sign stock lines in sync when owners restock or buyers purchase. */
public final class ShopStockSignListener implements Listener {

    private final RootMcShopsPlugin plugin;
    private final ShopStore store;

    public ShopStockSignListener(RootMcShopsPlugin plugin, ShopStore store) {
        this.plugin = plugin;
        this.store = store;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInventoryClose(InventoryCloseEvent event) {
        ShopListing shop = ShopProtection.shopForInventory(store, event.getInventory());
        if (shop == null) {
            return;
        }
        plugin.getServer().getScheduler().runTask(plugin, () -> ShopSigns.updateSign(plugin, shop));
    }
}
