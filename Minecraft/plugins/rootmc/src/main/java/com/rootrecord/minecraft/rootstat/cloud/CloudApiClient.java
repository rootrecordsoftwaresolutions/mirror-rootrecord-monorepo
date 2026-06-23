package com.rootrecord.minecraft.rootstat.cloud;

import com.rootrecord.minecraft.rootstat.config.RootStatConfig;
import com.rootrecord.minecraft.rootstat.model.LinkedPlayer;
import com.rootrecord.minecraft.rootstat.model.LinkStartResult;
import com.rootrecord.minecraft.rootstat.model.McMMOPlayerSnapshot;
import com.rootrecord.minecraft.rootstat.economy.EconomySnapshot;
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

    public void syncEconomy(EconomySnapshot snapshot) throws IOException, InterruptedException {
        if (snapshot == null) {
            return;
        }
        String syncedAt = Instant.now().toString();
        post("/api/realm/minecraft/economy/sync", buildEconomySyncBody(snapshot, syncedAt));
    }

    public void syncIngameEvents(List<com.rootrecord.minecraft.rootmc.ingame.IngameEventBuffer.PendingEvent> events)
            throws IOException, InterruptedException {
        if (events == null || events.isEmpty()) {
            return;
        }
        post("/api/rootmc/ingame-events", buildIngameEventsBody(events));
    }

    public record ChatRelayMessage(String username, String minecraftUuid, String message, String kind, String createdAt) {}

    public void relayIngameChat(List<ChatRelayMessage> messages) throws IOException, InterruptedException {
        if (messages == null || messages.isEmpty()) {
            return;
        }
        post("/api/rootmc/ingame-chat", buildIngameChatBody(messages));
    }

    public record DiscordInboundMessage(String id, String username, String message) {}

    public record DiscordChatPoll(List<DiscordInboundMessage> messages, String newestId) {}

    public DiscordChatPoll pollDiscordChat(String afterMessageId) throws IOException, InterruptedException {
        String path = "/api/rootmc/ingame-chat/poll";
        if (afterMessageId != null && !afterMessageId.isBlank()) {
            path += "?after=" + java.net.URLEncoder.encode(afterMessageId, java.nio.charset.StandardCharsets.UTF_8);
        }
        String json = get(path);
        List<DiscordInboundMessage> messages = new ArrayList<>();
        int arrayStart = json.indexOf("\"messages\"");
        if (arrayStart >= 0) {
            int open = json.indexOf('[', arrayStart);
            int close = json.indexOf(']', open);
            if (open >= 0 && close > open) {
                String arrayBody = json.substring(open + 1, close);
                int idx = 0;
                while (idx < arrayBody.length()) {
                    int objStart = arrayBody.indexOf('{', idx);
                    if (objStart < 0) {
                        break;
                    }
                    int depth = 0;
                    int objEnd = -1;
                    for (int i = objStart; i < arrayBody.length(); i++) {
                        char c = arrayBody.charAt(i);
                        if (c == '{') {
                            depth++;
                        } else if (c == '}') {
                            depth--;
                            if (depth == 0) {
                                objEnd = i + 1;
                                break;
                            }
                        }
                    }
                    if (objEnd < 0) {
                        break;
                    }
                    String chunk = arrayBody.substring(objStart, objEnd);
                    String id = extractString(chunk, "id");
                    String username = extractString(chunk, "username");
                    String message = extractString(chunk, "message");
                    if (id != null && message != null) {
                        messages.add(new DiscordInboundMessage(id, username, message));
                    }
                    idx = objEnd;
                }
            }
        }
        String newestId = extractString(json, "newest_id");
        return new DiscordChatPoll(messages, newestId);
    }

    private static String buildIngameChatBody(List<ChatRelayMessage> messages) {
        StringBuilder sb = new StringBuilder("{\"messages\":[");
        for (int i = 0; i < messages.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            ChatRelayMessage m = messages.get(i);
            sb.append("{\"username\":\"").append(escapeJson(m.username())).append('"');
            if (m.minecraftUuid() != null && !m.minecraftUuid().isBlank()) {
                sb.append(",\"minecraft_uuid\":\"").append(escapeJson(m.minecraftUuid())).append('"');
            }
            sb.append(",\"message\":\"").append(escapeJson(m.message())).append('"');
            if (m.kind() != null && !m.kind().isBlank()) {
                sb.append(",\"kind\":\"").append(escapeJson(m.kind())).append('"');
            }
            if (m.createdAt() != null && !m.createdAt().isBlank()) {
                sb.append(",\"created_at\":\"").append(escapeJson(m.createdAt())).append('"');
            }
            sb.append('}');
        }
        sb.append("]}");
        return sb.toString();
    }

    public void syncTownySnapshot(java.util.Map<String, Object> snapshot)
            throws IOException, InterruptedException {
        if (snapshot == null || snapshot.isEmpty()) {
            return;
        }
        post("/api/rootmc/towny/sync", buildTownySyncBody(snapshot));
    }

    private static String buildTownySyncBody(java.util.Map<String, Object> snapshot) {
        StringBuilder sb = new StringBuilder("{");
        appendTownyArray(sb, "towns", snapshot.get("towns"));
        sb.append(',');
        appendTownyArray(sb, "nations", snapshot.get("nations"));
        sb.append('}');
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void appendTownyArray(StringBuilder sb, String key, Object value) {
        sb.append('"').append(key).append("\":[");
        if (value instanceof Iterable<?> iterable) {
            boolean first = true;
            for (Object item : iterable) {
                if (!(item instanceof java.util.Map<?, ?> map)) {
                    continue;
                }
                if (!first) {
                    sb.append(',');
                }
                first = false;
                sb.append(mapToJson((java.util.Map<String, Object>) map));
            }
        }
        sb.append(']');
    }

    private static String mapToJson(java.util.Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (var entry : map.entrySet()) {
            if (!first) {
                sb.append(',');
            }
            first = false;
            sb.append('"').append(escapeJson(entry.getKey())).append("\":");
            Object v = entry.getValue();
            if (v instanceof Number || v instanceof Boolean) {
                sb.append(v);
            } else {
                sb.append('"').append(escapeJson(String.valueOf(v))).append('"');
            }
        }
        sb.append('}');
        return sb.toString();
    }

    public VaultClaimResult claimVaultOrders(String minecraftUuid)
            throws IOException, InterruptedException {
        String body = "{\"minecraft_uuid\":\"" + escapeJson(minecraftUuid) + "\"}";
        String json = post("/api/rootmc/vault/claim", body);
        return VaultClaimResult.parse(json);
    }

    public record GoldTransfer(String id, String fromUuid, String toUuid, double amount) {}

    public record GoldTransferResult(String id, String status, String error) {}

    public List<GoldTransfer> fetchPendingGoldTransfers() throws IOException, InterruptedException {
        String json = get("/api/rootmc/economy/transfers/pending");
        List<GoldTransfer> out = new ArrayList<>();
        int idx = 0;
        while (idx < json.length()) {
            int idPos = json.indexOf("\"id\"", idx);
            if (idPos < 0) {
                break;
            }
            String chunk = json.substring(idPos, Math.min(json.length(), idPos + 480));
            String id = extractString(chunk, "id");
            if (id == null || id.isBlank()) {
                break;
            }
            String fromUuid = extractString(chunk, "from_uuid");
            String toUuid = extractString(chunk, "to_uuid");
            double amount = parseJsonNumber(chunk, "amount");
            if (fromUuid != null && toUuid != null && amount >= 0.01d) {
                out.add(new GoldTransfer(id, fromUuid, toUuid, amount));
            }
            idx = idPos + 4;
            if (out.size() >= 50) {
                break;
            }
        }
        return out;
    }

    public void completeGoldTransfers(List<GoldTransferResult> results)
            throws IOException, InterruptedException {
        if (results == null || results.isEmpty()) {
            return;
        }
        StringBuilder sb = new StringBuilder("{\"transfers\":[");
        for (int i = 0; i < results.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            GoldTransferResult r = results.get(i);
            sb.append("{\"id\":\"").append(escapeJson(r.id())).append('"');
            sb.append(",\"status\":\"").append(escapeJson(r.status())).append('"');
            if (r.error() != null && !r.error().isBlank()) {
                sb.append(",\"error\":\"").append(escapeJson(r.error())).append('"');
            }
            sb.append('}');
        }
        sb.append("]}");
        post("/api/rootmc/economy/transfers/complete", sb.toString());
    }

    private static String buildIngameEventsBody(
            List<com.rootrecord.minecraft.rootmc.ingame.IngameEventBuffer.PendingEvent> events) {
        StringBuilder sb = new StringBuilder("{\"events\":[");
        for (int i = 0; i < events.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            var e = events.get(i);
            sb.append("{\"minecraft_uuid\":\"").append(escapeJson(e.minecraftUuid())).append('"');
            if (e.minecraftUsername() != null) {
                sb.append(",\"minecraft_username\":\"").append(escapeJson(e.minecraftUsername())).append('"');
            }
            sb.append(",\"event_type\":\"").append(escapeJson(e.eventType())).append('"');
            sb.append(",\"world_name\":\"").append(escapeJson(e.worldName())).append('"');
            sb.append(",\"dimension\":\"").append(escapeJson(e.dimension())).append('"');
            sb.append(",\"x\":").append(e.x());
            sb.append(",\"y\":").append(e.y());
            sb.append(",\"z\":").append(e.z());
            if (e.label() != null) {
                sb.append(",\"label\":\"").append(escapeJson(e.label())).append('"');
            }
            if (e.body() != null) {
                sb.append(",\"body\":\"").append(escapeJson(e.body())).append('"');
            }
            sb.append(",\"created_at\":\"").append(escapeJson(e.createdAt())).append('"');
            sb.append('}');
        }
        sb.append("]}");
        return sb.toString();
    }

    public record VaultClaimResult(List<VaultItem> items) {
        public record VaultItem(String itemKey, int quantity) {}

        static VaultClaimResult parse(String json) {
            List<VaultItem> items = new ArrayList<>();
            int idx = 0;
            while (true) {
                int keyStart = json.indexOf("\"item_key\"", idx);
                if (keyStart < 0) {
                    break;
                }
                String slice = json.substring(keyStart, Math.min(json.length(), keyStart + 120));
                String itemKey = extractString(slice, "item_key");
                String qtyStr = extractString(slice, "quantity");
                if (itemKey != null && qtyStr != null) {
                    try {
                        items.add(new VaultItem(itemKey, Integer.parseInt(qtyStr)));
                    } catch (NumberFormatException ignored) {
                        /* skip malformed */
                    }
                }
                idx = keyStart + 12;
            }
            return new VaultClaimResult(items);
        }
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

    private static String buildEconomySyncBody(EconomySnapshot snapshot, String syncedAt) {
        StringBuilder sb = new StringBuilder("{\"synced_at\":\"")
                .append(escapeJson(syncedAt))
                .append("\",\"shop_prices\":[");
        for (int i = 0; i < snapshot.shopPrices().size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            EconomySnapshot.ShopPriceRow row = snapshot.shopPrices().get(i);
            sb.append("{\"item_key\":\"").append(escapeJson(row.itemKey())).append("\",\"prices\":[");
            for (int p = 0; p < row.prices().size(); p++) {
                if (p > 0) {
                    sb.append(',');
                }
                sb.append(row.prices().get(p));
            }
            sb.append("],\"source\":\"").append(escapeJson(row.source())).append("\"}");
        }
        sb.append("],\"shop_listings\":[");
        for (int i = 0; i < snapshot.shopListings().size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            EconomySnapshot.ShopListingRow row = snapshot.shopListings().get(i);
            sb.append("{\"shop_id\":\"").append(escapeJson(row.shopId())).append('"');
            if (row.ownerUuid() != null && !row.ownerUuid().isBlank()) {
                sb.append(",\"owner_uuid\":\"").append(escapeJson(row.ownerUuid())).append('"');
            }
            if (row.ownerUsername() != null && !row.ownerUsername().isBlank()) {
                sb.append(",\"owner_username\":\"").append(escapeJson(row.ownerUsername())).append('"');
            }
            sb.append(",\"world\":\"").append(escapeJson(row.worldName())).append('"');
            sb.append(",\"x\":").append(row.x());
            sb.append(",\"y\":").append(row.y());
            sb.append(",\"z\":").append(row.z());
            sb.append(",\"item_key\":\"").append(escapeJson(row.itemKey())).append('"');
            sb.append(",\"price\":").append(row.price());
            sb.append(",\"listing_type\":\"").append(escapeJson(row.listingType())).append("\"");
            sb.append(",\"stock_quantity\":").append(Math.max(0, row.stockQuantity()));
            sb.append("}");
        }
        sb.append("],\"balances\":[");
        for (int i = 0; i < snapshot.balances().size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            EconomySnapshot.BalanceRow row = snapshot.balances().get(i);
            sb.append("{\"minecraft_uuid\":\"").append(escapeJson(row.uuid())).append('"');
            if (row.username() != null && !row.username().isBlank()) {
                sb.append(",\"minecraft_username\":\"").append(escapeJson(row.username())).append('"');
            }
            sb.append(",\"balance\":").append(row.balance());
            sb.append(",\"currency\":\"").append(escapeJson(row.currency())).append("\"}");
        }
        sb.append("],\"player_items\":[");
        for (int i = 0; i < snapshot.playerItems().size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            EconomySnapshot.PlayerItemsRow row = snapshot.playerItems().get(i);
            sb.append("{\"minecraft_uuid\":\"").append(escapeJson(row.uuid())).append('"');
            if (row.username() != null && !row.username().isBlank()) {
                sb.append(",\"minecraft_username\":\"").append(escapeJson(row.username())).append('"');
            }
            sb.append(",\"source\":\"").append(escapeJson(row.source())).append("\",\"items\":{");
            int itemIdx = 0;
            for (var entry : row.items().entrySet()) {
                if (itemIdx++ > 0) {
                    sb.append(',');
                }
                sb.append('"').append(escapeJson(entry.getKey())).append("\":").append(entry.getValue());
            }
            sb.append("}}");
        }
        sb.append("],\"server_items\":{");
        int serverIdx = 0;
        for (var entry : snapshot.serverItems().entrySet()) {
            if (serverIdx++ > 0) {
                sb.append(',');
            }
            sb.append('"').append(escapeJson(entry.getKey())).append("\":").append(entry.getValue());
        }
        sb.append("}}");
        return sb.toString();
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

    private String publicGet(String path) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(config.apiBase() + path))
                .timeout(Duration.ofSeconds(20))
                .GET()
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IOException("HTTP " + response.statusCode() + ": " + response.body());
        }
        return response.body();
    }

    public record ItemValueQuote(
            String itemKey, double each, double perStack, int stackSize, int samples) {}

    public List<ItemValueQuote> lookupItemValue(String itemQuery) throws IOException, InterruptedException {
        String encoded = java.net.URLEncoder.encode(itemQuery, java.nio.charset.StandardCharsets.UTF_8);
        String server = java.net.URLEncoder.encode(config.serverId(), java.nio.charset.StandardCharsets.UTF_8);
        String json = publicGet("/api/rootmc/server/value?item=" + encoded + "&server_id=" + server);
        List<ItemValueQuote> out = new ArrayList<>();
        int idx = 0;
        while (idx < json.length()) {
            int keyPos = json.indexOf("\"item_key\"", idx);
            if (keyPos < 0) {
                break;
            }
            String itemKey = extractString(json.substring(keyPos), "item_key");
            if (itemKey == null || itemKey.isBlank()) {
                break;
            }
            String chunk = json.substring(keyPos, Math.min(json.length(), keyPos + 420));
            double each = parseJsonNumber(chunk, "price_per_each");
            double stack = parseJsonNumber(chunk, "price_per_stack");
            int stackSize = (int) parseJsonNumber(chunk, "stack_size");
            int samples = (int) parseJsonNumber(chunk, "sample_count");
            if (stackSize <= 0) {
                stackSize = 64;
            }
            out.add(new ItemValueQuote(itemKey, each, stack, stackSize, samples));
            idx = keyPos + 10;
            if (out.size() >= 4) {
                break;
            }
        }
        return out;
    }

    private static double parseJsonNumber(String json, String key) {
        Pattern p = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*(-?[0-9]+(?:\\.[0-9]+)?)");
        Matcher m = p.matcher(json);
        if (!m.find()) {
            return 0;
        }
        try {
            return Double.parseDouble(m.group(1));
        } catch (NumberFormatException ex) {
            return 0;
        }
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
