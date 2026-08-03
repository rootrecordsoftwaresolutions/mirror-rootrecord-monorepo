package com.rootrecord.minecraft.rootquestionnaire.listener;

import com.rootrecord.minecraft.rootquestionnaire.RootQuestionnairePlugin;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

public final class QuestionnaireJoinListener implements Listener {

    private final RootQuestionnairePlugin plugin;

    public QuestionnaireJoinListener(RootQuestionnairePlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        plugin.service().maybeSendJoinHint(event.getPlayer());
    }
}
