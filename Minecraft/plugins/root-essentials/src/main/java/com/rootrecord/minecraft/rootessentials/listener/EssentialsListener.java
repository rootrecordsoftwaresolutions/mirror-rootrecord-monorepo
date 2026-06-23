package com.rootrecord.minecraft.rootessentials.listener;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.ItemStack;

@SuppressWarnings("deprecation")
public final class EssentialsListener implements Listener {

    private final RootEssentialsPlugin plugin;

    public EssentialsListener(RootEssentialsPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onPreLogin(AsyncPlayerPreLoginEvent event) {
        try {
            var ban = plugin.moderation().activeBan(event.getUniqueId());
            if (ban.isPresent()) {
                event.disallow(AsyncPlayerPreLoginEvent.Result.KICK_BANNED, "Banned: " + ban.get().reason());
            }
        } catch (Exception ex) {
            plugin.getLogger().warning("Ban check failed: " + ex.getMessage());
        }
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        try {
            plugin.ensureBalanceRow(player);
        } catch (Exception ex) {
            plugin.getLogger().warning("Balance init failed for " + player.getName() + ": " + ex.getMessage());
        }
        if (plugin.playerState().isVanished(player.getUniqueId())) {
            for (Player online : Bukkit.getOnlinePlayers()) {
                if (!online.hasPermission("essentials.vanish.see") && !online.hasPermission("rootessentials.vanish.see")) {
                    online.hidePlayer(plugin, player);
                }
            }
        }
        plugin.grantNewbieKit(player);
        Long ptime = plugin.playerState().playerTime(player.getUniqueId());
        if (ptime != null) {
            player.setPlayerTime(ptime, false);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.playerState().clearAfk(event.getPlayer().getUniqueId());
        plugin.playerState().clearTpa(event.getPlayer().getUniqueId());
        plugin.teleportWarmup().onQuit(event.getPlayer().getUniqueId());
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (event.getEntity() instanceof Player player && plugin.playerState().isGod(player.getUniqueId())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlayerCombat(EntityDamageByEntityEvent event) {
        if (!(event.getEntity() instanceof Player victim)) {
            return;
        }
        Player attacker = attackerPlayer(event.getDamager());
        if (attacker == null || attacker.equals(victim)) {
            return;
        }
        plugin.teleportWarmup().tagCombat(victim);
        plugin.teleportWarmup().tagCombat(attacker);
    }

    private static Player attackerPlayer(org.bukkit.entity.Entity damager) {
        if (damager instanceof Player player) {
            return player;
        }
        if (damager instanceof org.bukkit.entity.Projectile projectile
                && projectile.getShooter() instanceof Player shooter) {
            return shooter;
        }
        return null;
    }

    @EventHandler
    public void onTrashClose(InventoryCloseEvent event) {
        if (!(event.getPlayer() instanceof Player)) return;
        String title = event.getView().getTitle();
        if (title == null || !title.contains("Trash")) return;
        for (ItemStack stack : event.getInventory().getContents()) {
            if (stack != null) stack.setAmount(0);
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDeath(PlayerDeathEvent event) {
        if (Permissions.has(event.getEntity(), "back.ondeath")) {
            plugin.playerState().rememberDeath(event.getEntity());
        }
    }

    @EventHandler(priority = EventPriority.LOWEST)
    public void onChat(AsyncPlayerChatEvent event) {
        Player player = event.getPlayer();
        try {
            if (plugin.moderation().activeMute(player.getUniqueId()).isPresent()) {
                event.setCancelled(true);
                player.sendMessage(plugin.msg("muted"));
                return;
            }
        } catch (Exception ignored) {
        }
        if (plugin.playerState().isGlobalChatMuted()
                && !Permissions.has(player, "mutechat.exempt")
                && !player.hasPermission("essentials.mutechat.exempt")) {
            event.setCancelled(true);
            player.sendMessage(plugin.msg("chat-muted"));
            return;
        }
        event.getRecipients().removeIf(recipient ->
                plugin.playerState().isIgnoring(recipient.getUniqueId(), player.getUniqueId()));
        if (plugin.playerState().isAfk(player.getUniqueId())) {
            plugin.playerState().clearAfk(player.getUniqueId());
        }
        String msg = event.getMessage();
        if (Permissions.has(player, "chat.color") || Permissions.has(player, "chat.rgb")) {
            msg = msg.replace('&', '\u00A7');
        }
        event.setMessage(msg);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        if (event.getFrom().getBlockX() == event.getTo().getBlockX()
                && event.getFrom().getBlockY() == event.getTo().getBlockY()
                && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) {
            return;
        }
        plugin.playerState().clearAfk(event.getPlayer().getUniqueId());
        plugin.teleportWarmup().onMove(event.getPlayer(), event.getFrom(), event.getTo());
    }
}
