package com.rootrecord.minecraft.rootmcshops;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.block.BlockFace;
import org.bukkit.block.Sign;
import org.bukkit.block.data.type.WallSign;
import org.bukkit.block.sign.Side;
import org.bukkit.entity.Player;

import java.util.Locale;

/** Wall signs mounted on the chest face the player is looking at. */
public final class ShopSigns {

    private static final LegacyComponentSerializer LEGACY = LegacyComponentSerializer.legacySection();
    private static final BlockFace[] HORIZONTAL = {
            BlockFace.NORTH, BlockFace.SOUTH, BlockFace.EAST, BlockFace.WEST,
    };

    private ShopSigns() {}

    public record SignPlacement(Block block, boolean migrated) {}

    public static boolean isSignMaterial(Material type) {
        if (type == null) {
            return false;
        }
        String name = type.name();
        return name.endsWith("_WALL_SIGN")
                || (name.endsWith("_SIGN") && !name.contains("HANGING"));
    }

    /** Chest face that points toward the player (where the wall sign mounts). */
    public static BlockFace chestFaceTowardPlayer(Player player) {
        return opposite(player.getFacing());
    }

    /**
     * Wall sign on {@code chestFace} of the chest. Sign text faces {@code opposite(chestFace)} (toward the player
     * when {@code chestFace} is {@link #chestFaceTowardPlayer(Player)}).
     */
    public static Block placeWallSignOnFace(Block chest, BlockFace chestFace) {
        if (chest == null || !ShopContainers.isShopContainer(chest.getType()) || !isHorizontalChestFace(chestFace)) {
            return null;
        }
        Block signBlock = chest.getRelative(chestFace);
        if (sameBlock(signBlock, chest)) {
            return null;
        }
        if (!signBlock.getType().isAir() || ShopContainers.isShopContainer(signBlock)) {
            return null;
        }
        signBlock.setType(Material.OAK_WALL_SIGN);
        if (signBlock.getBlockData() instanceof WallSign wall) {
            // Facing = direction text points; chestFace is the side toward the player.
            wall.setFacing(chestFace);
            signBlock.setBlockData(wall);
        }
        return signBlock.getState() instanceof Sign ? signBlock : null;
    }

    public static Block placeWallSignFacingPlayer(Block chest, Player player) {
        BlockFace toward = chestFaceTowardPlayer(player);
        Block placed = placeWallSignOnFace(chest, toward);
        if (placed != null) {
            return placed;
        }
        for (BlockFace face : HORIZONTAL) {
            if (face == toward) {
                continue;
            }
            placed = placeWallSignOnFace(chest, face);
            if (placed != null) {
                return placed;
            }
        }
        return null;
    }

    public static Block chestBlockForSign(Block signBlock) {
        if (signBlock == null || !isSignMaterial(signBlock.getType())) {
            return null;
        }
        if (signBlock.getBlockData() instanceof WallSign wall) {
            Block chest = signBlock.getRelative(wall.getFacing().getOppositeFace());
            if (ShopContainers.isShopContainer(chest)) {
                return chest;
            }
        }
        return null;
    }

    public static BlockFace chestFaceForSignBlock(Block chest, Block signBlock) {
        if (chest == null || signBlock == null) {
            return null;
        }
        int dx = signBlock.getX() - chest.getX();
        int dy = signBlock.getY() - chest.getY();
        int dz = signBlock.getZ() - chest.getZ();
        if (dy != 0 || Math.abs(dx) + Math.abs(dz) != 1) {
            return null;
        }
        if (dx == 1) {
            return BlockFace.EAST;
        }
        if (dx == -1) {
            return BlockFace.WEST;
        }
        if (dz == 1) {
            return BlockFace.SOUTH;
        }
        if (dz == -1) {
            return BlockFace.NORTH;
        }
        return null;
    }

    public static SignPlacement ensureSignOnChest(Block chest, ShopListing shop) {
        if (chest == null || shop == null) {
            return null;
        }
        Block existing = shop.signBlock();
        if (existing != null && isSignMaterial(existing.getType())) {
            BlockFace face = chestFaceForSignBlock(chest, existing);
            if (face != null) {
                return new SignPlacement(existing, false);
            }
        }

        BlockFace stored = existing == null ? null : chestFaceForSignBlock(chest, existing);
        Block placed = stored != null ? placeWallSignOnFace(chest, stored) : null;
        if (placed == null) {
            placed = placeWallSignOnFace(chest, BlockFace.NORTH);
        }
        if (placed == null) {
            for (BlockFace face : HORIZONTAL) {
                placed = placeWallSignOnFace(chest, face);
                if (placed != null) {
                    break;
                }
            }
        }
        if (placed == null) {
            return null;
        }
        boolean migrated = existing == null
                || placed.getX() != shop.signX()
                || placed.getY() != shop.signY()
                || placed.getZ() != shop.signZ();
        return new SignPlacement(placed, migrated);
    }

    public static void updateSign(RootMcShopsPlugin plugin, ShopListing shop) {
        updateSign(shop, plugin == null ? 0 : plugin.countStock(shop));
    }

    public static void updateSign(ShopListing shop, int stockCount) {
        Block block = shop.signBlock();
        if (block == null || !isSignMaterial(block.getType())) {
            return;
        }
        if (!(block.getState() instanceof Sign sign)) {
            return;
        }
        String item = prettyItem(shop.itemKey());
        int qty = Math.max(1, shop.saleQty());
        String priceLine = shop.isBuyShop()
                ? truncate(String.format(Locale.US, "BUY %.2f G", shop.price()), 15)
                : truncate(String.format(Locale.US, qty > 1 ? "%.2f G ea" : "%.2f G", shop.price()), 15);
        setLine(sign, 0, truncate(item, 15));
        setLine(sign, 1, priceLine);
        setLine(sign, 2, truncate("x" + qty + " · " + shop.ownerName(), 15));
        String stockLine = shop.isBuyShop()
                ? (stockCount > 0 ? "wants " + stockCount : "full")
                : (stockCount > 0 ? stockCount + " in stock" : "out of stock");
        setLine(sign, 3, truncate(stockLine, 15));
        sign.update(true, false);
    }

    public static void clearSign(ShopListing shop) {
        Block block = shop.signBlock();
        Block chest = shop.block();
        removeSignBlock(block, chest);
    }

    /** Removes a pending or shop sign without touching the chest/barrel. */
    public static boolean removeSignBlock(Block signBlock, Block chestBlock) {
        if (signBlock == null) {
            return true;
        }
        if (!isSignMaterial(signBlock.getType())) {
            return signBlock.getType().isAir();
        }
        if (chestBlock != null && sameBlock(signBlock, chestBlock)) {
            return false;
        }
        if (ShopContainers.isShopContainer(signBlock)) {
            return false;
        }
        signBlock.setType(Material.AIR, false);
        return true;
    }

    /** Removes any wall sign on the horizontal faces of a shop container (pending or stale). */
    public static boolean clearSignsOnChestFaces(Block chest) {
        if (chest == null || !ShopContainers.isShopContainer(chest)) {
            return false;
        }
        boolean removed = false;
        for (BlockFace face : HORIZONTAL) {
            if (removeSignBlock(chest.getRelative(face), chest)) {
                removed = true;
            }
        }
        return removed;
    }

    private static boolean sameBlock(Block a, Block b) {
        return a.getWorld().equals(b.getWorld())
                && a.getX() == b.getX()
                && a.getY() == b.getY()
                && a.getZ() == b.getZ();
    }

    public static void markPendingSign(Block signBlock, String itemKey, int qty) {
        if (signBlock == null || !(signBlock.getState() instanceof Sign sign)) {
            return;
        }
        setLine(sign, 0, truncate(prettyItem(itemKey), 15));
        setLine(sign, 1, "Enter price");
        setLine(sign, 2, "in chat…");
        setLine(sign, 3, truncate("x" + qty, 15));
        sign.update(true, false);
    }

    private static boolean isHorizontalChestFace(BlockFace face) {
        return face == BlockFace.NORTH
                || face == BlockFace.SOUTH
                || face == BlockFace.EAST
                || face == BlockFace.WEST;
    }

    private static void setLine(Sign sign, int index, String legacyText) {
        sign.getSide(Side.FRONT).line(index, legacy(legacyText));
    }

    private static Component legacy(String text) {
        return LEGACY.deserialize(text == null ? "" : text);
    }

    private static BlockFace opposite(BlockFace face) {
        return switch (face) {
            case NORTH -> BlockFace.SOUTH;
            case SOUTH -> BlockFace.NORTH;
            case EAST -> BlockFace.WEST;
            case WEST -> BlockFace.EAST;
            default -> BlockFace.NORTH;
        };
    }

    private static String prettyItem(String itemKey) {
        return itemKey.toLowerCase(Locale.ROOT).replace('_', ' ');
    }

    private static String truncate(String text, int max) {
        if (text == null) {
            return "";
        }
        return text.length() <= max ? text : text.substring(0, max);
    }
}
