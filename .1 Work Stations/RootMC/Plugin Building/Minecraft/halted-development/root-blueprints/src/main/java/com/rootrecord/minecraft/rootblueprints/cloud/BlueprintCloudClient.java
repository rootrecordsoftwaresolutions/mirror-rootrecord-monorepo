package com.rootrecord.minecraft.rootblueprints.cloud;

import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class BlueprintCloudClient {

    private static final Pattern JSON_BOOL = Pattern.compile("\"(linked|blueprint_eligible)\"\\s*:\\s*(true|false)");

    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(12)).build();
    private final RootRecordCloudConfig.CloudSettings settings;

    public BlueprintCloudClient(RootRecordCloudConfig.CloudSettings settings) {
        this.settings = settings;
    }

    public boolean hasCredentials() {
        return settings.hasServerCredentials();
    }

    public MemberProfile fetchMemberProfile(String uuid) throws IOException, InterruptedException {
        String json = get("/api/realm/minecraft/link/status?uuid=" + uuid);
        boolean linked = false;
        boolean eligible = false;
        Matcher bool = JSON_BOOL.matcher(json);
        while (bool.find()) {
            if ("linked".equals(bool.group(1))) {
                linked = "true".equals(bool.group(2));
            } else if ("blueprint_eligible".equals(bool.group(1))) {
                eligible = "true".equals(bool.group(2));
            }
        }
        String accountId = extractString(json, "account_id");
        if (accountId == null || accountId.isBlank()) {
            accountId = extractString(json, "email");
        }
        return new MemberProfile(linked, eligible, accountId);
    }

    public UploadResult uploadBlueprint(UploadRequest request) throws IOException, InterruptedException {
        String b64 = Base64.getEncoder().encodeToString(request.schematicBytes());
        String json = "{"
                + "\"account_id\":\"" + escapeJson(request.accountId()) + "\","
                + "\"minecraft_uuid\":\"" + escapeJson(request.minecraftUuid()) + "\","
                + "\"minecraft_username\":\"" + escapeJson(request.minecraftUsername()) + "\","
                + "\"town_name\":\"" + escapeJson(request.townName()) + "\","
                + "\"plot_x\":" + request.plotX() + ","
                + "\"plot_z\":" + request.plotZ() + ","
                + "\"world_name\":\"" + escapeJson(request.worldName()) + "\","
                + "\"chunk_x\":" + request.chunkX() + ","
                + "\"chunk_z\":" + request.chunkZ() + ","
                + "\"anchor_x\":" + request.anchorX() + ","
                + "\"anchor_y\":" + request.anchorY() + ","
                + "\"anchor_z\":" + request.anchorZ() + ","
                + "\"content_base64\":\"" + escapeJson(b64) + "\""
                + "}";
        String response = post("/api/rootmc/blueprint/upload", json);
        String downloadUrl = extractString(response, "download_url");
        String fileName = extractString(response, "file_name");
        if (downloadUrl == null || fileName == null) {
            throw new IOException("upload response missing download_url");
        }
        return new UploadResult(fileName, downloadUrl);
    }

    private String get(String path) throws IOException, InterruptedException {
        HttpRequest request = authorized(HttpRequest.newBuilder()
                .uri(URI.create(settings.apiBase() + path))
                .timeout(Duration.ofSeconds(20))
                .GET());
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IOException("HTTP " + response.statusCode());
        }
        return response.body();
    }

    private String post(String path, String jsonBody) throws IOException, InterruptedException {
        HttpRequest request = authorized(HttpRequest.newBuilder()
                .uri(URI.create(settings.apiBase() + path))
                .timeout(Duration.ofSeconds(90))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody)));
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IOException("HTTP " + response.statusCode() + ": " + truncate(response.body(), 200));
        }
        return response.body();
    }

    private HttpRequest authorized(HttpRequest.Builder builder) {
        return builder
                .header("X-RootStat-Server-Id", settings.serverId())
                .header("X-RootStat-Server-Secret", settings.serverSecret())
                .build();
    }

    private static String extractString(String json, String key) {
        Pattern p = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"([^\"]*)\"");
        Matcher m = p.matcher(json);
        if (!m.find()) {
            return null;
        }
        return m.group(1);
    }

    private static String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private static String truncate(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max) + "…";
    }

    public record MemberProfile(boolean linked, boolean blueprintEligible, String accountId) {}

    public record UploadRequest(
            String accountId,
            String minecraftUuid,
            String minecraftUsername,
            String townName,
            int plotX,
            int plotZ,
            String worldName,
            int chunkX,
            int chunkZ,
            int anchorX,
            int anchorY,
            int anchorZ,
            byte[] schematicBytes) {}

    public record UploadResult(String fileName, String downloadUrl) {}
}
