package com.rootrecord.minecraft.rootcontracts.config;

import org.bukkit.configuration.file.FileConfiguration;

public record ContractsMessages(String prefix) {

    public static ContractsMessages from(FileConfiguration cfg) {
        String prefix = "&8[&6Contracts&8]&r ";
        if (cfg != null) {
            prefix = cfg.getString("messages.prefix", prefix);
        }
        return new ContractsMessages(prefix);
    }
}
