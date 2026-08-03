package com.rootrecord.minecraft.roottorch;

import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.bstats.Metrics;
import com.rootrecord.minecraft.common.bstats.RootBStats;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.roottorch.command.TorchCommand;
import com.rootrecord.minecraft.roottorch.command.PassCommand;
import com.rootrecord.minecraft.roottorch.data.TorchRecordStore;
import com.rootrecord.minecraft.roottorch.listener.TorchChatListener;
import com.rootrecord.minecraft.roottorch.placeholder.RootTorchExpansion;
import com.rootrecord.minecraft.roottorch.service.TorchSessionService;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.command.PluginCommand;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

public final class RootTorchPlugin extends JavaPlugin {

    public static final String CONFIG_FILE = "root-torch.yml";

    private RootRecordYamlConfig yaml;
    private TorchSessionService sessions;
    private TorchRecordStore records;
    private Metrics metrics;

    @Override
    public void onEnable() {
        metrics = RootBStats.start(this);

        RootRecordFolders.ensureDir(this);
        yaml = new RootRecordYamlConfig(this, CONFIG_FILE, "root-torch.yml");
        yaml.load();
        records = new TorchRecordStore(this);
        sessions = new TorchSessionService(this);
        sessions.reload(yaml.config());

        bind("torch", new TorchCommand(this));
        PassCommand pass = new PassCommand(this);
        bind("torchpass", pass);
        getLogger().info("Root-Torch enabled — /torch and /torchpass (/tpass).");

        getServer().getPluginManager().registerEvents(sessions, this);
        getServer().getPluginManager().registerEvents(new TorchChatListener(this), this);
        Bukkit.getScheduler().runTask(this, this::registerPlaceholderExpansionIfPresent);
        Bukkit.getScheduler().runTaskLater(this, this::registerPlaceholderExpansionIfPresent, 40L);
    }

    @Override
    public void onDisable() {
        RootBStats.shutdown(metrics);
        if (sessions != null) {
            sessions.shutdown();
        }
    }

    public void reloadLocal() {
        if (yaml != null) {
            yaml.reload();
        }
        if (records != null) {
            records.load();
        }
        if (sessions != null && yaml != null) {
            sessions.reload(yaml.config());
        }
    }

    /** Persist {@code cost-gold} and apply live. */
    public boolean setCostGold(double amount) {
        if (yaml == null || sessions == null) {
            return false;
        }
        double gold = Math.max(0, amount);
        yaml.config().set("cost-gold", gold);
        yaml.save();
        sessions.setCostGold(gold);
        return true;
    }

    public TorchSessionService sessions() {
        return sessions;
    }

    public TorchRecordStore records() {
        return records;
    }

    public FileConfiguration configFile() {
        return yaml != null ? yaml.config() : null;
    }

    public String colorize(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "";
        }
        return ChatColor.translateAlternateColorCodes('&', raw);
    }

    public String msg(String key) {
        FileConfiguration cfg = configFile();
        String prefix = cfg != null ? cfg.getString("messages.prefix", "") : "";
        String body = cfg != null ? cfg.getString("messages." + key, key) : key;
        return colorize((prefix == null ? "" : prefix) + (body == null ? key : body));
    }

    public void registerPlaceholderExpansionIfPresent() {
        if (Bukkit.getPluginManager().getPlugin("PlaceholderAPI") == null) {
            return;
        }
        try {
            new RootTorchExpansion(this).register();
        } catch (Throwable ex) {
            getLogger().warning("PlaceholderAPI expansion register failed: " + ex.getMessage());
        }
    }

    private void bind(String name, Object executor) {
        PluginCommand cmd = getCommand(name);
        if (cmd == null) {
            getLogger().warning("Command missing from plugin.yml: " + name);
            return;
        }
        if (executor instanceof org.bukkit.command.CommandExecutor ce) {
            cmd.setExecutor(ce);
        }
        if (executor instanceof org.bukkit.command.TabCompleter tc) {
            cmd.setTabCompleter(tc);
        }
    }
}
