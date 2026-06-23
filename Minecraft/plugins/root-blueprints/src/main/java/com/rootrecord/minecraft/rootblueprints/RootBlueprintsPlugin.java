package com.rootrecord.minecraft.rootblueprints;

import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootblueprints.cloud.BlueprintCloudClient;
import com.rootrecord.minecraft.rootblueprints.command.BlueprintCommand;
import com.rootrecord.minecraft.rootblueprints.config.BlueprintConfig;
import com.rootrecord.minecraft.rootblueprints.config.BlueprintMessages;
import com.rootrecord.minecraft.rootblueprints.service.PendingSaveStore;
import org.bukkit.ChatColor;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

public final class RootBlueprintsPlugin extends JavaPlugin {

    private RootRecordYamlConfig yamlConfig;
    private BlueprintConfig blueprintConfig;
    private BlueprintMessages messages;
    private BlueprintCloudClient cloud;
    private PendingSaveStore pending;

    @Override
    public void onEnable() {
        RootRecordFolders.ensureDir(this);
        RootRecordCloudConfig.ensureDefaults(this);
        yamlConfig = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_BLUEPRINTS_CONFIG, "root-blueprints.yml");
        reloadLocalConfig();

        PluginCommand blueprint = getCommand("blueprint");
        if (blueprint != null) {
            BlueprintCommand handler = new BlueprintCommand(this);
            blueprint.setExecutor(handler);
            blueprint.setTabCompleter(handler);
        }
        PluginCommand admin = getCommand("rootblueprints");
        if (admin != null) {
            admin.setExecutor((sender, command, label, args) -> {
                if (!sender.hasPermission("rootblueprints.reload")) {
                    sender.sendMessage(color(messages.prefix() + "&cNo permission."));
                    return true;
                }
                reloadLocalConfig();
                sender.sendMessage(color(messages.prefix() + "&aRoot-Blueprints reloaded."));
                return true;
            });
        }

        getLogger().info("Root-Blueprints enabled.");
    }

    public void reloadLocalConfig() {
        if (yamlConfig != null) {
            yamlConfig.reload();
        }
        blueprintConfig = BlueprintConfig.from(yamlConfig != null ? yamlConfig.config() : null);
        messages = BlueprintMessages.from(yamlConfig != null ? yamlConfig.config() : null);
        cloud = new BlueprintCloudClient(RootRecordCloudConfig.resolve(this, yamlConfig != null ? yamlConfig.config() : null));
        pending = new PendingSaveStore(blueprintConfig.confirmTimeoutSeconds());
    }

    public BlueprintConfig blueprintConfig() {
        return blueprintConfig;
    }

    public BlueprintMessages messages() {
        return messages;
    }

    public BlueprintCloudClient cloud() {
        return cloud;
    }

    public PendingSaveStore pending() {
        return pending;
    }

    public static String color(String input) {
        return ChatColor.translateAlternateColorCodes('&', input == null ? "" : input);
    }
}
