package com.rootrecord.minecraft.rootbonds.gui;

import com.rootrecord.minecraft.common.RootMcEnderChestResolver;
import com.rootrecord.minecraft.common.RootMcEnderChestService;
import com.rootrecord.minecraft.rootbonds.RootBondsPlugin;
import com.rootrecord.minecraft.rootbonds.data.BondsStore;
import com.rootrecord.minecraft.rootbonds.item.BondCertificate;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.inventory.ItemStack;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/** Bond registration only from double /ec — inventory holdings are inactive. */
public final class BondOwnershipListener implements Listener {

    private final RootBondsPlugin plugin;

    public BondOwnershipListener(RootBondsPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        plugin.getServer().getScheduler().runTaskLater(plugin.host(), () -> registerHeldBonds(event.getPlayer()), 40L);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInventoryClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }
        plugin.getServer().getScheduler().runTask(plugin.host(), () -> registerHeldBonds(player));
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInventoryClose(InventoryCloseEvent event) {
        if (!(event.getPlayer() instanceof Player player)) {
            return;
        }
        plugin.getServer().getScheduler().runTask(plugin.host(), () -> registerHeldBonds(player));
    }

    private void registerHeldBonds(Player player) {
        if (player == null || !player.isOnline()) {
            return;
        }
        var transfer = plugin.bondTransfer();
        if (transfer == null || plugin.bonds() == null || plugin.bonds().store() == null) {
            return;
        }
        ItemStack[] ender = enderContents(player);
        Set<UUID> inEc = new HashSet<>();
        BondCertificate certs = plugin.bonds().certificates();
        for (ItemStack stack : ender) {
            if (stack == null) {
                continue;
            }
            if (certs.isBondedRoot(stack)) {
                plugin.bonds().ensureBondedRootRegistered(player, stack);
            }
            UUID bondId = certs.readBondId(stack);
            if (bondId != null) {
                inEc.add(bondId);
            }
        }
        transfer.registerCertificatesInInventory(player, ender);
        try {
            for (BondsStore.BondRow bond : plugin.bonds().store().listActiveForOwner(player.getUniqueId())) {
                if (!inEc.contains(bond.id())) {
                    plugin.bonds().store().clearOwner(bond.id());
                }
            }
        } catch (Exception ex) {
            plugin.getLogger().warning("Bond EC deregister: " + ex.getMessage());
        }
    }

    ItemStack[] enderContents(Player player) {
        RootMcEnderChestService ec = RootMcEnderChestResolver.resolve(plugin.host());
        if (ec != null) {
            return ec.contents(player.getUniqueId());
        }
        return player.getEnderChest().getContents();
    }
}
