package com.rootrecord.minecraft.blocknotes.cloud;

import com.rootrecord.minecraft.blocknotes.config.BlockNotesConfig;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public final class CloudHeartbeatClient {

    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();

    private BlockNotesConfig config;
    private String pluginVersion;

    public CloudHeartbeatClient(BlockNotesConfig config, String pluginVersion) {
        this.config = config;
        this.pluginVersion = pluginVersion;
    }

    public void updateConfig(BlockNotesConfig config, String pluginVersion) {
        this.config = config;
        this.pluginVersion = pluginVersion;
    }

    public String sendHeartbeat() throws IOException, InterruptedException {
        String body =
                "{"
                        + "\"plugin_version\":\"" + escape(pluginVersion) + "\","
                        + "\"server_address\":\"" + escape(config.serverAddress()) + "\","
                        + "\"default_world_name\":\"" + escape(config.defaultWorldName()) + "\","
                        + "\"game_version\":\"" + escape(config.gameVersion()) + "\""
                        + (config.mapUrl().isBlank()
                                ? ""
                                : ",\"map_url\":\"" + escape(config.mapUrl()) + "\"")
                        + "}";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(config.apiBase() + "/api/blocknotes/server/heartbeat"))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("X-RootStat-Server-Id", config.serverId())
                .header("X-RootStat-Server-Secret", config.serverSecret())
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IOException("HTTP " + response.statusCode() + ": " + response.body());
        }
        return response.body();
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
