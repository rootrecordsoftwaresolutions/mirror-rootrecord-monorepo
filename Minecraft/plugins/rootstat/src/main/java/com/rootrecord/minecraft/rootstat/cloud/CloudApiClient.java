package com.rootrecord.minecraft.rootstat.cloud;

import com.rootrecord.minecraft.rootstat.config.RootStatConfig;
import com.rootrecord.minecraft.rootstat.model.LinkedPlayer;
import com.rootrecord.minecraft.rootstat.model.LinkStartResult;
import com.rootrecord.minecraft.rootstat.model.McMMOPlayerSnapshot;
import com.rootrecord.minecraft.rootstat.model.ServerPlayerSnapshot;

import java.io.IOException;
import java.time.Instant;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class CloudApiClient {

    private static final Pattern JSON_BOOL = Pattern.compile("\"linked\"\\s*:\\s*(true|false)");
    private static final Pattern JSON_CODE = Pattern.compile("\"code\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern JSON_URL = Pattern.compile("\"verify_url\"\\s*:\\s*\"([^\"]+)\"");

    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();

    private RootStatConfig config;

    public CloudApiClient(RootStatConfig config) {
        this.config = config;
    }

    public void updateConfig(RootStatConfig config) {
        this.config = config;
    }

    public LinkStartResult startLink(String uuid, String username) throws IOException, InterruptedException {
        String body = "{\"uuid\":\"" + escapeJson(uuid) + "\",\"username\":\"" + escapeJson(username) + "\"}";
        String json = post("/api/realm/minecraft/link/start", body);
        Matcher code = JSON_CODE.matcher(json);
        Matcher url = JSON_URL.matcher(json);
        if (!code.find() || !url.find()) {
            throw new IOException("Unexpected link/start response");
        }
        return new LinkStartResult(code.group(1), url.group(1));
    }

    public LinkStatus linkStatus(String uuid) throws IOException, InterruptedException {
        String json = get("/api/realm/minecraft/link/status?uuid=" + uuid);
        Matcher linked = JSON_BOOL.matcher(json);
        if (!linked.find()) {
            return LinkStatus.unlinked();
        }
        if (!"true".equals(linked.group(1))) {
            return LinkStatus.unlinked();
        }
        return new LinkStatus(
                true,
                extractString(json, "account_id"),
                extractString(json, "email"),
                extractString(json, "minecraft_username"));
    }

    public List<LinkedPlayer> sync(String sinceIso) throws IOException, InterruptedException {
        String path = sinceIso == null || sinceIso.isBlank()
                ? "/api/realm/minecraft/sync"
                : "/api/realm/minecraft/sync?since=" + sinceIso;
        String json = get(path);
        List<LinkedPlayer> out = new ArrayList<>();
        int idx = 0;
        while (true) {
            int start = json.indexOf("\"minecraft_uuid\"", idx);
            if (start < 0) {
                break;
            }
            String slice = json.substring(start, Math.min(json.length(), start + 400));
            String uuid = extractString(slice, "minecraft_uuid");
            String uname = extractString(slice, "minecraft_username");
            String account = extractString(slice, "account_id");
            String email = extractString(slice, "email");
            String verifiedAt = extractString(slice, "verified_at");
            String updatedAt = extractString(slice, "updated_at");
            if (uuid != null) {
                out.add(new LinkedPlayer(uuid, uname, account, email, verifiedAt, updatedAt));
            }
            idx = start + 20;
        }
        return out;
    }

    public int syncServerStats(List<ServerPlayerSnapshot> players) throws IOException, InterruptedException {
        if (players == null || players.isEmpty()) {
            return 0;
        }
        String syncedAt = Instant.now().toString();
        int total = 0;
        final int batchSize = 40;
        for (int i = 0; i < players.size(); i += batchSize) {
            int end = Math.min(players.size(), i + batchSize);
            String body = buildServerSyncBody(players.subList(i, end), syncedAt);
            post("/api/realm/minecraft/mcmmo/sync", body);
            total += end - i;
        }
        return total;
    }

    /** @deprecated use {@link #syncServerStats} */
    public int syncMcmmo(List<McMMOPlayerSnapshot> players) throws IOException, InterruptedException {
        if (players == null || players.isEmpty()) {
            return 0;
        }
        List<ServerPlayerSnapshot> mapped = new ArrayList<>();
        for (McMMOPlayerSnapshot p : players) {
            mapped.add(new ServerPlayerSnapshot(
                    p.uuid(), p.username(), p.powerLevel(), p.skills(), null, null, null));
        }
        return syncServerStats(mapped);
    }

    private static String buildServerSyncBody(List<ServerPlayerSnapshot> players, String syncedAt) {
        StringBuilder sb = new StringBuilder("{\"players\":[");
        for (int i = 0; i < players.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            ServerPlayerSnapshot p = players.get(i);
            sb.append("{\"minecraft_uuid\":\"").append(escapeJson(p.uuid())).append('"');
            if (p.username() != null && !p.username().isBlank()) {
                sb.append(",\"minecraft_username\":\"").append(escapeJson(p.username())).append('"');
            }
            if (p.powerLevel() != null) {
                sb.append(",\"power_level\":").append(p.powerLevel());
            }
            sb.append(",\"synced_at\":\"").append(escapeJson(syncedAt)).append('"');
            if (p.skills() != null && !p.skills().isEmpty()) {
                sb.append(",\"skills\":{");
                int skillIdx = 0;
                for (var entry : p.skills().entrySet()) {
                    if (skillIdx++ > 0) {
                        sb.append(',');
                    }
                    sb.append('"').append(escapeJson(entry.getKey())).append("\":").append(entry.getValue());
                }
                sb.append('}');
            }
            if (p.playtimeSeconds() != null) {
                sb.append(",\"playtime_seconds\":").append(p.playtimeSeconds());
            }
            if (p.firstJoinAt() != null && !p.firstJoinAt().isBlank()) {
                sb.append(",\"first_join_at\":\"").append(escapeJson(p.firstJoinAt())).append('"');
            }
            if (p.lastLoginAt() != null && !p.lastLoginAt().isBlank()) {
                sb.append(",\"last_login_at\":\"").append(escapeJson(p.lastLoginAt())).append('"');
            }
            sb.append('}');
        }
        sb.append("]}");
        return sb.toString();
    }

    private static String buildMcmmoSyncBody(List<McMMOPlayerSnapshot> players, String syncedAt) {
        StringBuilder sb = new StringBuilder("{\"players\":[");
        for (int i = 0; i < players.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            McMMOPlayerSnapshot p = players.get(i);
            sb.append("{\"minecraft_uuid\":\"").append(escapeJson(p.uuid())).append('"');
            if (p.username() != null && !p.username().isBlank()) {
                sb.append(",\"minecraft_username\":\"").append(escapeJson(p.username())).append('"');
            }
            sb.append(",\"power_level\":").append(p.powerLevel());
            sb.append(",\"synced_at\":\"").append(escapeJson(syncedAt)).append('"');
            sb.append(",\"skills\":{");
            int skillIdx = 0;
            for (var entry : p.skills().entrySet()) {
                if (skillIdx++ > 0) {
                    sb.append(',');
                }
                sb.append('"').append(escapeJson(entry.getKey())).append("\":").append(entry.getValue());
            }
            sb.append("}}");
        }
        sb.append("]}");
        return sb.toString();
    }

    private String get(String path) throws IOException, InterruptedException {
        HttpRequest request = authorized(HttpRequest.newBuilder()
                .uri(URI.create(config.apiBase() + path))
                .timeout(Duration.ofSeconds(30))
                .GET());
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IOException("HTTP " + response.statusCode() + ": " + response.body());
        }
        return response.body();
    }

    private String post(String path, String jsonBody) throws IOException, InterruptedException {
        HttpRequest request = authorized(HttpRequest.newBuilder()
                .uri(URI.create(config.apiBase() + path))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody)));
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IOException("HTTP " + response.statusCode() + ": " + response.body());
        }
        return response.body();
    }

    private HttpRequest authorized(HttpRequest.Builder builder) {
        return builder
                .header("X-RootStat-Server-Id", config.serverId())
                .header("X-RootStat-Server-Secret", config.serverSecret())
                .build();
    }

    private static String extractString(String json, String key) {
        Pattern p = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*(\"([^\"]*)\"|null)");
        Matcher m = p.matcher(json);
        if (!m.find()) {
            return null;
        }
        return m.group(2);
    }

    private static String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    public record LinkStatus(boolean linked, String accountId, String email, String minecraftUsername) {
        static LinkStatus unlinked() {
            return new LinkStatus(false, null, null, null);
        }

        /** Player-facing label — never show raw account UUID. */
        public String displayLabel() {
            if (email != null && !email.isBlank()) {
                return email;
            }
            if (minecraftUsername != null && !minecraftUsername.isBlank()) {
                return minecraftUsername;
            }
            return "your RootRecord account";
        }
    }
}
