package com.rootrecord.minecraft.rootmcshops;

import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Barrel;
import org.bukkit.block.Block;
import org.bukkit.block.BlockState;
import org.bukkit.block.Chest;
import org.bukkit.block.Container;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;

import java.util.HashMap;

/** Chests and barrels that can hold shop stock. */
public final class ShopContainers {

    private ShopContainers() {}

    public static boolean isShopContainer(Material type) {
        return type == Material.CHEST || type == Material.BARREL;
    }

    public static boolean isShopContainer(Block block) {
        return block != null && isShopContainer(block.getType());
    }

    public static Container containerState(Block block) {
        if (block != null && block.getState() instanceof Container container) {
            return container;
        }
        return null;
    }

    /** Live world inventory for this container (not a stale BlockState snapshot). Never call {@link BlockState#update} after edits. */
    public static Inventory containerInventory(Block block) {
        return liveContainerInventory(block);
    }

    private static Inventory liveContainerInventory(Block block) {
        if (block == null) {
            return null;
        }
        BlockState state = block.getState();
        if (state instanceof Chest chest) {
            // getBlockInventory() is only one half of a double chest — stock/sign counts would read 0
            // when items sit in the partner half. getInventory() is the shared double-chest inventory.
            return chest.getInventory();
        }
        if (state instanceof Barrel barrel) {
            return barrel.getInventory();
        }
        if (state instanceof Container container) {
            return container.getInventory();
        }
        return null;
    }

    /** Loads the chunk and returns the live shop anchor block. */
    public static Block liveShopBlock(ShopListing shop) {
        if (shop == null) {
            return null;
        }
        World world = org.bukkit.Bukkit.getWorld(shop.world());
        if (world == null) {
            return null;
        }
        int chunkX = shop.x() >> 4;
        int chunkZ = shop.z() >> 4;
        if (!world.isChunkLoaded(chunkX, chunkZ)) {
            world.getChunkAt(chunkX, chunkZ);
        }
        Block block = world.getBlockAt(shop.x(), shop.y(), shop.z());
        return isShopContainer(block) ? block : null;
    }

    public static Inventory shopInventory(ShopListing shop) {
        return liveContainerInventory(liveShopBlock(shop));
    }

    public static int countMatchingItems(ShopListing shop, Material mat) {
        if (shop == null || mat == null || mat.isAir()) {
            return 0;
        }
        Inventory inv = shopInventory(shop);
        return inv == null ? 0 : countInInventory(inv, mat);
    }

    /**
     * Removes items from the live tile inventory. Do not call {@link BlockState#update} afterward —
     * on Paper that can re-apply a stale snapshot and restore stock (dupe).
     */
    public static boolean withdrawMatchingItems(ShopListing shop, Material mat, int quantity) {
        if (shop == null || mat == null || mat.isAir() || quantity <= 0) {
            return false;
        }
        Block block = liveShopBlock(shop);
        Inventory inv = liveContainerInventory(block);
        if (inv == null) {
            return false;
        }
        int before = countInInventory(inv, mat);
        if (before < quantity) {
            return false;
        }
        HashMap<Integer, ItemStack> leftover = inv.removeItem(new ItemStack(mat, quantity));
        if (!leftover.isEmpty()) {
            return false;
        }
        int after = countInInventory(inv, mat);
        if (before - after != quantity) {
            inv.addItem(new ItemStack(mat, quantity));
            return false;
        }
        return true;
    }

    /** Returns items to the shop container (e.g. rollback after a failed payment). */
    public static boolean depositMatchingItems(ShopListing shop, Material mat, int quantity) {
        if (shop == null || mat == null || mat.isAir() || quantity <= 0) {
            return false;
        }
        Block block = liveShopBlock(shop);
        Inventory inv = liveContainerInventory(block);
        if (inv == null) {
            return false;
        }
        HashMap<Integer, ItemStack> leftover = inv.addItem(new ItemStack(mat, quantity));
        return leftover.isEmpty();
    }

    public static int countBuyCapacity(Inventory inv, Material mat) {
        if (inv == null || mat == null || mat.isAir()) {
            return 0;
        }
        int maxStack = mat.getMaxStackSize();
        int capacity = 0;
        for (ItemStack stack : inv.getStorageContents()) {
            if (stack == null || stack.getType().isAir()) {
                capacity += maxStack;
            } else if (stack.getType() == mat) {
                capacity += maxStack - stack.getAmount();
            }
        }
        return capacity;
    }

    private static int countInInventory(Inventory inv, Material mat) {
        int count = 0;
        for (ItemStack stack : inv.getContents()) {
            if (stack != null && !stack.getType().isAir() && stack.getType() == mat) {
                count += stack.getAmount();
            }
        }
        return count;
    }
}
