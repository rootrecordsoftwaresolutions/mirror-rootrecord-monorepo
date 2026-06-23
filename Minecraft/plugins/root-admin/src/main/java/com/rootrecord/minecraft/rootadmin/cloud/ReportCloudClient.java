package com.rootrecord.minecraft.rootadmin.cloud;

import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public final class ReportCloudClient {

    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(12)).build();
    private final RootRecordCloudConfig.CloudSettings settings;

    public ReportCloudClient(RootRecordCloudConfig.CloudSettings settings) {
        this.settings = settings;
    }

    public boolean hasCredentials() {
        return settings.hasServerCredentials();
    }

    public void submitReport(
            String reportId,
            String reporterUuid,
            String reporterName,
            String targetUuid,
            String targetName,
            boolean targetOnline,
            String reason,
            String body)
            throws IOException, InterruptedException {
        String json = "{"
                + "\"report_id\":\"" + escapeJson(reportId) + "\","
                + "\"reporter_uuid\":\"" + escapeJson(reporterUuid) + "\","
                + "\"reporter_name\":\"" + escapeJson(reporterName) + "\","
                + "\"target_uuid\":\"" + escapeJson(targetUuid) + "\","
                + "\"target_name\":\"" + escapeJson(targetName) + "\","
                + "\"target_online\":" + targetOnline + ","
                + "\"reason\":\"" + escapeJson(reason == null ? "" : reason) + "\","
                + "\"body\":\"" + escapeJson(body) + "\""
                + "}";
        post("/api/rootmc/ingame-report", json);
    }

    private void post(String path, String jsonBody) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(settings.apiBase() + path))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("X-RootStat-Server-Id", settings.serverId())
                .header("X-RootStat-Server-Secret", settings.serverSecret())
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IOException("HTTP " + response.statusCode() + ": " + response.body());
        }
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
}
