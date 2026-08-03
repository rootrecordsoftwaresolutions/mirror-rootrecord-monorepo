package com.rootrecord.minecraft.roottorch.listener;

import com.rootrecord.minecraft.roottorch.RootTorchPlugin;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;

/** Fallback chat [T] tag when PlaceholderAPI / Towny format is not used. */
public final class TorchChatListener implements Listener {

    private final RootTorchPlugin plugin;

    public TorchChatListener(RootTorchPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent event) {
        // Claims / no TownyChat: Root-Play CatalogChatListener owns format (includes [T]).
        if (plugin.getServer().getPluginManager().getPlugin("TownyChat") == null) {
            return;
        }
        if (plugin.sessions() == null || !plugin.sessions().isHolder(event.getPlayer())) {
            return;
        }
        String tag = plugin.sessions().chatTagColored();
        if (tag == null || tag.isBlank()) {
            return;
        }
        String format = event.getFormat();
        if (format != null && (format.contains("[T]") || format.contains("[J]"))) {
            return;
        }
        event.setFormat(tag + format);
    }
}
