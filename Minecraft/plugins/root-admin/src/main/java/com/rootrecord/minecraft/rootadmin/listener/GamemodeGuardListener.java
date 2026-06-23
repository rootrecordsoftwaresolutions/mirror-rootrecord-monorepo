package com.rootrecord.minecraft.rootadmin.listener;

import com.rootrecord.minecraft.rootadmin.RootAdminPlugin;
import com.rootrecord.minecraft.rootadmin.util.AdminPermissions;
import org.bukkit.GameMode;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerGameModeChangeEvent;
import org.bukkit.event.player.PlayerJoinEvent;

/** Keeps staff in survival/spectator unless they explicitly have gamemode nodes. */
public final class GamemodeGuardListener implements Listener {

    private final RootAdminPlugin plugin;

    public GamemodeGuardListener(RootAdminPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        plugin.getServer().getScheduler().runTask(plugin, () -> enforceAllowedGamemode(player, true));
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onGamemodeChange(PlayerGameModeChangeEvent event) {
        GameMode requested = event.getNewGameMode();
        if (AdminPermissions.canUseGamemode(event.getPlayer(), requested)) {
            return;
        }
        event.setCancelled(true);
        enforceAllowedGamemode(event.getPlayer(), false);
    }

    private void enforceAllowedGamemode(Player player, boolean onJoin) {
        GameMode current = player.getGameMode();
        if (AdminPermissions.canUseGamemode(player, current)) {
            return;
        }
        player.setGameMode(GameMode.SURVIVAL);
        player.setAllowFlight(false);
        player.setFlying(false);
        if (onJoin) {
            player.sendMessage(plugin.msg("gamemode-join-survival"));
        } else {
            player.sendMessage(plugin.msg("gamemode-denied"));
        }
    }
}
