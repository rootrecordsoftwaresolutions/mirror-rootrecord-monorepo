package com.rootrecord.minecraft.roothelp.command;

import com.rootrecord.minecraft.roothelp.RootHelpPlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public final class RulesCommand implements CommandExecutor {

    private final RootHelpPlugin plugin;

    public RulesCommand(RootHelpPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("roothelp.rules")) {
            sender.sendMessage(plugin.colorize("&cYou don't have permission."));
            return true;
        }
        sender.sendMessage(plugin.msg("rules-header"));
        for (String rule : plugin.helpConfig().rules()) {
            sender.sendMessage(plugin.colorize(" &8• " + rule));
        }
        Component wiki = Component.text()
                .append(Component.text("Full guide: ", NamedTextColor.GRAY))
                .append(Component.text("rootmc.net/wiki/player/", NamedTextColor.AQUA, TextDecoration.UNDERLINED)
                        .clickEvent(ClickEvent.openUrl("https://rootmc.net/wiki/player/")))
                .build();
        sender.sendMessage(wiki);
        return true;
    }
}
