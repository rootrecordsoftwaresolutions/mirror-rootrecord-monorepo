package com.rootrecord.minecraft.rootloans.listener;

import com.rootrecord.minecraft.rootloans.RootLoansPlugin;
import com.rootrecord.minecraft.rootloans.util.GoldValue;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.inventory.ItemStack;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

public final class GoldOreLoanListener implements Listener {

    private static final List<Material> GOLD_ORES = List.of(
            Material.GOLD_ORE,
            Material.DEEPSLATE_GOLD_ORE,
            Material.NETHER_GOLD_ORE);

    private final RootLoansPlugin plugin;

    public GoldOreLoanListener(RootLoansPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        if (!plugin.loansConfig().goldOreRepayment() || !plugin.loans().enabled()) {
            return;
        }
        Block block = event.getBlock();
        if (!GOLD_ORES.contains(block.getType())) {
            return;
        }
        Player player = event.getPlayer();
        try {
            if (plugin.store().findActive(player.getUniqueId()).isEmpty()) {
                return;
            }
        } catch (Exception ex) {
            plugin.getLogger().warning("Gold ore loan check failed: " + ex.getMessage());
            return;
        }

        ItemStack tool = player.getInventory().getItemInMainHand();
        Collection<ItemStack> drops = block.getDrops(tool, player);
        double goldValue = 0;
        List<ItemStack> keep = new ArrayList<>();
        for (ItemStack drop : drops) {
            double value = GoldValue.goldItemValue(drop);
            if (value > 0) {
                goldValue += value;
            } else {
                keep.add(drop);
            }
        }
        if (goldValue <= 0) {
            return;
        }
        event.setDropItems(false);
        for (ItemStack stack : keep) {
            block.getWorld().dropItemNaturally(block.getLocation(), stack);
        }
        plugin.loans().applyOreIncome(player, goldValue);
    }
}
