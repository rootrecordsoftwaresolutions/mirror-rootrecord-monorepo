package com.rootrecord.minecraft.rootstat.economy.shop;

import org.bukkit.Material;
import org.bukkit.inventory.ItemStack;

import java.util.Locale;

public final class ShopItemKeys {

    private ShopItemKeys() {}

    public static String fromMaterialName(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String cleaned = raw.trim().toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_');
        try {
            Material material = Material.matchMaterial(cleaned);
            if (material != null && material.isItem()) {
                return material.name();
            }
        } catch (Exception ignored) {
            // fall through
        }
        String normalized = cleaned.replaceAll("[^A-Z0-9_]", "");
        return normalized.isBlank() ? null : normalized;
    }

    public static String fromItemStack(ItemStack stack) {
        if (stack == null || stack.getType().isAir()) {
            return null;
        }
        return stack.getType().name();
    }

    public static String fromObject(Object itemLike) {
        if (itemLike == null) {
            return null;
        }
        if (itemLike instanceof ItemStack stack) {
            return fromItemStack(stack);
        }
        try {
            Object type = itemLike.getClass().getMethod("getType").invoke(itemLike);
            if (type instanceof Material material) {
                return material.isItem() ? material.name() : null;
            }
        } catch (ReflectiveOperationException ignored) {
            // fall through
        }
        return fromMaterialName(String.valueOf(itemLike));
    }
}
