package com.rootrecord.minecraft.rootmcshops;

import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.block.BlockFace;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;

/** Ownership checks and shop block lookups for grief protection. */
public final class ShopProtection {

    private static final BlockFace[] HORIZONTAL = {
            BlockFace.NORTH, BlockFace.SOUTH, BlockFace.EAST, BlockFace.WEST,
    };

    private static final Material[] LOGISTICS = {
            Material.HOPPER,
            Material.DROPPER,
            Material.DISPENSER,
    };

    private ShopProtection() {}

    public static boolean canManage(Player player, ShopListing shop) {
        return ShopService.isOwner(shop, player) || player.hasPermission("rootshops.admin");
    }

    /** Listing registered exactly on this block (not double-chest partner inference). */
    public static ShopListing shopAnchorAt(ShopStore store, Block block) {
        if (block == null) {
            return null;
        }
        return store.getAt(block.getWorld().getName(), block.getX(), block.getY(), block.getZ());
    }

    /** Break/sign protection — anchor container or shop sign only. */
    public static ShopListing shopProtectingBlockForBreak(ShopStore store, Block block) {
        if (block == null) {
            return null;
        }
        ShopListing anchor = shopAnchorAt(store, block);
        if (anchor != null && ShopContainers.isShopContainer(block)) {
            return anchor;
        }
        return store.getBySignBlock(block);
    }

    /** Hopper/dropper placement guard — horizontal neighbors of shop anchors/signs only. */
    public static ShopListing shopNearAnchor(ShopStore store, Block block) {
        if (block == null) {
            return null;
        }
        ShopListing direct = shopProtectingBlockForBreak(store, block);
        if (direct != null) {
            return direct;
        }
        for (BlockFace face : HORIZONTAL) {
            ShopListing neighbor = shopProtectingBlockForBreak(store, block.getRelative(face));
            if (neighbor != null) {
                return neighbor;
            }
        }
        return null;
    }

    public static ShopListing shopProtectingBlock(ShopStore store, Block block) {
        return shopProtectingBlockForBreak(store, block);
    }

    /** Drops listings whose container block is gone or no longer a chest/barrel. */
    public static ShopListing resolveShopListing(ShopStore store, ShopListing shop, RootMcShopsPlugin plugin) {
        if (shop == null) {
            return null;
        }
        Block anchor = shop.block();
        if (anchor != null && ShopContainers.isShopContainer(anchor)) {
            return shop;
        }
        Block sign = shop.signBlock();
        if (sign != null && ShopSigns.isSignMaterial(sign.getType())) {
            return shop;
        }
        store.remove(shop.id());
        if (plugin != null) {
            plugin.getLogger().info("Pruned stale shop listing " + shop.id());
        }
        return null;
    }

    /** Shop registered on this container block, or its double-chest partner. */
    public static ShopListing shopForContainerBlock(ShopStore store, Block block) {
        if (block == null || !ShopContainers.isShopContainer(block)) {
            return null;
        }
        String world = block.getWorld().getName();
        ShopListing direct = store.getAt(world, block.getX(), block.getY(), block.getZ());
        if (direct != null) {
            return direct;
        }
        if (block.getType() != Material.CHEST) {
            return null;
        }
        Inventory inv = ShopContainers.containerInventory(block);
        for (BlockFace face : HORIZONTAL) {
            Block other = block.getRelative(face);
            if (other.getType() != Material.CHEST) {
                continue;
            }
            ShopListing linked = store.getAt(world, other.getX(), other.getY(), other.getZ());
            if (linked == null) {
                continue;
            }
            Inventory otherInv = ShopContainers.containerInventory(other);
            if (inv != null && otherInv != null && inv.equals(otherInv)) {
                return linked;
            }
        }
        return null;
    }

    public static ShopListing shopForInventory(ShopStore store, Inventory inventory) {
        if (inventory == null) {
            return null;
        }
        for (ShopListing shop : store.all()) {
            Block block = shop.block();
            if (block == null) {
                continue;
            }
            Inventory shopInv = ShopContainers.containerInventory(block);
            if (shopInv != null && shopInv.equals(inventory)) {
                return shop;
            }
            if (block.getType() == Material.CHEST) {
                for (BlockFace face : HORIZONTAL) {
                    Block other = block.getRelative(face);
                    if (other.getType() != Material.CHEST) {
                        continue;
                    }
                    Inventory otherInv = ShopContainers.containerInventory(other);
                    if (otherInv != null && otherInv.equals(inventory)) {
                        return shop;
                    }
                }
            }
        }
        return null;
    }

    /**
     * Shop whose container or sign is horizontally adjacent (hopper/chest placement guard).
     * @deprecated use {@link #shopNearAnchor(ShopStore, Block)} for logistics placement
     */
    public static ShopListing shopTouchingBlock(ShopStore store, Block block) {
        return shopNearAnchor(store, block);
    }

    public static boolean isLogisticsBlock(Material type) {
        if (type == null) {
            return false;
        }
        for (Material logistics : LOGISTICS) {
            if (type == logistics) {
                return true;
            }
        }
        return false;
    }

    public static void deny(Player player, RootMcShopsPlugin plugin, ShopListing shop) {
        String owner = shop.ownerName() != null && !shop.ownerName().isBlank()
                ? shop.ownerName()
                : "another player";
        player.sendMessage(plugin.msg("protect-deny").replace("{owner}", owner));
    }
}
