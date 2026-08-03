package com.rootrecord.minecraft.rootquestionnaire.listener;

import com.rootrecord.minecraft.rootquestionnaire.RootQuestionnairePlugin;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;

public final class QuestionnaireChatListener implements Listener {

    private static final LegacyComponentSerializer LEGACY = LegacyComponentSerializer.legacySection();

    private final RootQuestionnairePlugin plugin;

    public QuestionnaireChatListener(RootQuestionnairePlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.LOWEST)
    public void onChat(AsyncChatEvent event) {
        Player player = event.getPlayer();
        if (!plugin.sessions().has(player.getUniqueId())) {
            return;
        }
        event.setCancelled(true);
        String message = LEGACY.serialize(event.message()).replaceAll("(?i)[§&][0-9a-fk-or]", "").trim();
        plugin.getServer().getScheduler().runTask(plugin, () -> plugin.service().handleAnswer(player, message));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.sessions().remove(event.getPlayer().getUniqueId());
    }
}
