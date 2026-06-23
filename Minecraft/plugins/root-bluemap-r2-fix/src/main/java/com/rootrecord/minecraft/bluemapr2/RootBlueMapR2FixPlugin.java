package com.rootrecord.minecraft.bluemapr2;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Sets AWS SDK properties before BlueMapS3Storage initializes.
 * Credentials come from plugins/Root-BlueMap-R2-Fix/r2.env (not HOCON).
 */
public final class RootBlueMapR2FixPlugin extends JavaPlugin {

    @Override
    public void onLoad() {
        System.setProperty("aws.requestChecksumCalculation", "WHEN_REQUIRED");
        System.setProperty("aws.responseChecksumValidation", "WHEN_REQUIRED");
        System.setProperty("aws.region", "auto");

        Path envFile = getDataFolder().toPath().resolve("r2.env");
        Map<String, String> env = loadEnv(envFile);
        if (env.isEmpty()) {
            getLogger().warning("Missing " + envFile + " — run apply-r2-keys-to-bluemap.ps1 and upload plugins/Root-BlueMap-R2-Fix/r2.env");
            return;
        }

        setIfPresent("aws.region", env.get("AWS_REGION"));
        setIfPresent("aws.accessKeyId", env.get("R2_ACCESS_KEY_ID"));
        setIfPresent("aws.secretAccessKey", env.get("R2_SECRET_ACCESS_KEY"));

        String key = env.get("R2_ACCESS_KEY_ID");
        if (key != null && key.length() >= 4) {
            getLogger().info("R2 credentials loaded from r2.env (access key starts " + key.substring(0, 4) + "...)");
        }
        getLogger().info("R2 signing flags set (aws.requestChecksumCalculation=WHEN_REQUIRED)");
    }

    private static void setIfPresent(String property, String value) {
        if (value != null && !value.isBlank()) {
            System.setProperty(property, value.trim());
        }
    }

    static Map<String, String> loadEnv(Path path) {
        Map<String, String> out = new HashMap<>();
        if (!Files.isRegularFile(path)) {
            return out;
        }
        try {
            for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int eq = line.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                out.put(line.substring(0, eq).trim(), line.substring(eq + 1).trim());
            }
        } catch (IOException e) {
            return out;
        }
        return out;
    }
}
