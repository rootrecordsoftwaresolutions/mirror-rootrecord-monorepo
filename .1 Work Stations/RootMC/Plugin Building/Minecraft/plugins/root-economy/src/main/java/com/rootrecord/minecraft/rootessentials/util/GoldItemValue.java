package com.rootrecord.minecraft.rootessentials.util;

import org.bukkit.Material;
import org.bukkit.inventory.ItemStack;

/** Mint peg for physical gold items (matches /mint rates).

 * Valued (mintable): nugget ¹⁄₉, raw gold / ingot 1, block / raw block 9.
 * Ore forms ({@link #isGoldOre}) are tracked as obtained materials but have
 * <strong>no</strong> mint peg — smelting creates the valued product separately.
 */
public final class GoldItemValue {

    private GoldItemValue() {}

    public static double stackValue(ItemStack stack) {
        if (stack == null || stack.getType().isAir() || stack.getAmount() <= 0) {
            return 0;
        }
        Double each = mintRate(stack.getType());
        return each == null ? 0 : each * stack.getAmount();
    }

    public static double stacksValue(Iterable<ItemStack> stacks) {
        double total = 0;
        if (stacks == null) {
            return 0;
        }
        for (ItemStack stack : stacks) {
            total += stackValue(stack);
        }
        return total;
    }

    /** Mint-peg G per item, or null if non-valued (ores). */
    public static Double mintRate(Material material) {
        if (material == null) {
            return null;
        }
        return switch (material) {
            case GOLD_NUGGET -> 1.0 / 9.0;
            case RAW_GOLD, GOLD_INGOT -> 1.0;
            case GOLD_BLOCK, RAW_GOLD_BLOCK -> 9.0;
            default -> null;
        };
    }

    public static boolean isGoldItem(Material material) {
        return mintRate(material) != null;
    }

    public static boolean isGoldOre(Material material) {
        if (material == null) {
            return false;
        }
        return material == Material.GOLD_ORE
                || material == Material.DEEPSLATE_GOLD_ORE
                || material == Material.NETHER_GOLD_ORE;
    }

    /** Gold items + ore forms that become gold after smelting. */
    public static boolean isGoldRelated(Material material) {
        return isGoldItem(material) || isGoldOre(material);
    }
}
