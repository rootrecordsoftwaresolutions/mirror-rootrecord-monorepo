package com.rootrecord.minecraft.rootadmin.listener;

import com.rootrecord.minecraft.rootadmin.RootAdminPlugin;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.server.PluginEnableEvent;

/** Staff use LuckPerms admin group — never vanilla operator. */
public final class StaffDeopListener implements Listener {

    private final RootAdminPlugin plugin;

    public StaffDeopListener(RootAdminPlugin plugin) {
        this.plugin = plugin;
    }

    public void deopStaffOnline() {
        for (Player player : Bukkit.getOnlinePlayers()) {
            deopIfStaff(player);
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        deopIfStaff(event.getPlayer());
    }

    private void deopIfStaff(Player player) {
        if (!player.isOp()) {
            return;
        }
        if (!player.hasPermission("group.admin")) {
            return;
        }
        player.setOp(false);
        plugin.getLogger().info("Removed vanilla OP from staff account " + player.getName()
                + " (LuckPerms admin group — use LP permissions, not ops.json).");
    }
}
