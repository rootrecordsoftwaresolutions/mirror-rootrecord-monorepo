package com.rootrecord.kilauea.alerts.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import com.rootrecord.kilauea.alerts.ui.KilaueaNavRoutes
import com.rootrecord.kilauea.alerts.ui.components.DisclaimerBanner
import com.rootrecord.kilauea.alerts.ui.home.HomeViewModel
import com.rootrecord.kilauea.alerts.ui.theme.EmberRed
import com.rootrecord.kilauea.alerts.ui.theme.LavaOrange
import com.rootrecord.kilauea.alerts.ui.util.extractVolcanoAlertLevel
import com.rootrecord.kilauea.alerts.ui.util.extractVolcanoHeroSubtitle
import com.rootrecord.kilauea.alerts.ui.util.formatWeatherTimestampForDisplay
import com.rootrecord.kilauea.alerts.ui.util.parseDashboardDetail
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private data class HomeEqRow(
    val mag: Double?,
    val place: String?,
    val timeMs: Long?,
    val url: String?,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HomeScreen(
    navController: NavController,
    vm: HomeViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    val ctx = LocalContext.current

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { vm.refresh(force = true) }) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh home")
            }
        },
    ) { innerPadding ->
        Box(
            Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                DisclaimerBanner()
                if (state.loading && state.volcano == null && state.earthquakes == null) {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                }
                HeroBanner(volcanoJson = state.volcano)
                if (state.loading && state.volcano == null) {
                    CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                }
                state.error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error)
                    Button(onClick = { vm.refresh(force = true) }) { Text("Retry") }
                }

                WeatherSnapshotCard(wxJson = state.volcanoVillageWeather)

                state.airQuality?.let { LiveAirQualityCard(airJson = it) }

                RecentEarthquakesCard(
                    eqJson = state.earthquakes,
                    onOpenEarthquakesTab = { navigateToMainTab(navController, KilaueaNavRoutes.Earthquakes) },
                    onOpenEvent = { url ->
                        url?.let { u -> ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u))) }
                    },
                )

                QuickJumpSection(navController = navController)

                Spacer(Modifier.padding(bottom = 8.dp))
            }
        }
    }
}

private fun navigateToMainTab(navController: NavController, route: String) {
    navController.navigate(route) {
        popUpTo(navController.graph.findStartDestination().id) {
            saveState = true
        }
        launchSingleTop = true
        restoreState = true
    }
}

@Composable
private fun HeroBanner(volcanoJson: JsonObject?) {
    val level = volcanoJson?.let { extractVolcanoAlertLevel(it) } ?: "Loading…"
    val subtitle = volcanoJson?.let { extractVolcanoHeroSubtitle(it) }
    val elevated = level.contains("WATCH", true) ||
        level.contains("WARNING", true) ||
        level.contains("ADVISORY", true)
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = Color.Transparent,
        ),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            if (elevated) EmberRed.copy(alpha = 0.35f) else LavaOrange.copy(alpha = 0.25f),
                            Color(0xFF2A1810),
                        ),
                    ),
                )
                .padding(20.dp),
        ) {
            Text("Kīlauea — USGS alert level", style = MaterialTheme.typography.labelMedium)
            Text(
                level,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = if (elevated) Color.White else MaterialTheme.colorScheme.onSurface,
            )
            Text(
                "See Alerts tab for official USGS/HVO links.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp),
            )
            subtitle?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun LiveAirQualityCard(airJson: JsonObject) {
    val ctx = LocalContext.current
    val cur = airJson["current"]?.jsonObject
    val lines = buildList {
        cur?.get("us_aqi")?.jsonPrimitive?.content?.toDoubleOrNull()?.toInt()?.let { aqi ->
            add("US AQI $aqi (${usAqiCategory(aqi)})")
        }
        cur?.get("pm2_5_ug_m3")?.jsonPrimitive?.content?.let { add("PM2.5: $it µg/m³") }
        cur?.get("pm10_ug_m3")?.jsonPrimitive?.content?.let { add("PM10: $it µg/m³") }
        cur?.get("ozone_ug_m3")?.jsonPrimitive?.content?.let { add("Ozone: $it µg/m³") }
        cur?.get("sulphur_dioxide_ug_m3")?.jsonPrimitive?.content?.let { add("Sulfur dioxide: $it µg/m³") }
        cur?.get("nitrogen_dioxide_ug_m3")?.jsonPrimitive?.content?.let { add("Nitrogen dioxide: $it µg/m³") }
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Air quality near Volcano Village", style = MaterialTheme.typography.titleMedium)
            Text(
                "Updated about every hour from Open-Meteo. Useful for smoke and vog trends — follow official advisories when air looks bad.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (lines.isEmpty()) {
                Text("No readings right now.", style = MaterialTheme.typography.bodyMedium)
            } else {
                lines.forEachIndexed { i, line ->
                    Text(line, style = MaterialTheme.typography.bodyMedium)
                    if (i < lines.lastIndex) {
                        HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    }
                }
            }
            airJson["observed_at_note"]?.jsonPrimitive?.content?.let { note ->
                Text(
                    note,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(
                onClick = {
                    ctx.startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("https://open-meteo.com/en/docs/air-quality-api"),
                        ),
                    )
                },
            ) {
                Text("About this data")
            }
        }
    }
}

private fun usAqiCategory(aqi: Int): String = when {
    aqi <= 50 -> "Good"
    aqi <= 100 -> "Moderate"
    aqi <= 150 -> "Unhealthy for sensitive groups"
    aqi <= 200 -> "Unhealthy"
    aqi <= 300 -> "Very unhealthy"
    else -> "Hazardous"
}

@Composable
private fun WeatherSnapshotCard(wxJson: JsonObject?) {
    Card(Modifier.fillMaxWidth()) {
        Column(
            Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text("Summit weather", style = MaterialTheme.typography.titleMedium)
            Text(
                "Volcano Village — same forecast as the Weather tab.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (wxJson == null) {
                Text("Loading…", style = MaterialTheme.typography.bodyMedium)
            } else {
                val detail = parseDashboardDetail(wxJson)
                detail.headlineCondition?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                detail.temperatureLine?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium)
                }
                detail.windLine?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                detail.humidityLine?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                detail.alertSummary?.let {
                    val hasAlerts = !it.contains("No major", ignoreCase = true) &&
                        !it.contains("No active", ignoreCase = true)
                    Text(
                        it,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (hasAlerts) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
                detail.forecastBullets.take(2).forEach { line ->
                    Text(
                        line,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                detail.fetchedAt?.let {
                    Text(
                        "As of ${formatWeatherTimestampForDisplay(it) ?: it}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun RecentEarthquakesCard(
    eqJson: JsonObject?,
    onOpenEarthquakesTab: () -> Unit,
    onOpenEvent: (String?) -> Unit,
) {
    val rows = topEarthquakeRows(eqJson, 4)
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Recent earthquakes", style = MaterialTheme.typography.titleMedium)
                OutlinedButton(onClick = onOpenEarthquakesTab) {
                    Text("Open tab")
                }
            }
            Text(
                "Newest earthquakes near Hawaiʻi from the USGS. Tap a row to open the official USGS page.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (rows.isEmpty()) {
                Text("No earthquake data yet.", style = MaterialTheme.typography.bodySmall)
            } else {
                rows.forEachIndexed { index, row ->
                    if (index > 0) HorizontalDivider(Modifier.padding(vertical = 4.dp))
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clickable(enabled = row.url != null) { onOpenEvent(row.url) }
                            .padding(vertical = 4.dp),
                    ) {
                        Text(
                            "M ${row.mag ?: "?"} · ${row.place ?: "Unknown"}",
                            style = MaterialTheme.typography.titleSmall,
                        )
                        Text(
                            row.timeMs?.let { formatEqTime(it) } ?: "",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuickJumpSection(navController: NavController) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Explore", style = MaterialTheme.typography.titleMedium)
            Text(
                "Open another part of the app.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val tabs = listOf(
                    KilaueaNavRoutes.Earthquakes to "Earthquakes",
                    KilaueaNavRoutes.Weather to "Weather",
                    KilaueaNavRoutes.Alerts to "Alerts",
                    KilaueaNavRoutes.LiveFeeds to "Live feeds",
                )
                tabs.forEach { (route, label) ->
                    OutlinedButton(onClick = { navigateToMainTab(navController, route) }) {
                        Text(label)
                    }
                }
            }
        }
    }
}

private fun topEarthquakeRows(geo: JsonObject?, limit: Int): List<HomeEqRow> {
    if (geo == null) return emptyList()
    val feats = geo["features"]?.jsonArray ?: JsonArray(emptyList())
    val rows = feats.mapNotNull { f ->
        val o = f.jsonObject
        val props = o["properties"]?.jsonObject ?: return@mapNotNull null
        HomeEqRow(
            mag = props["mag"]?.jsonPrimitive?.content?.toDoubleOrNull(),
            place = props["place"]?.jsonPrimitive?.content,
            timeMs = props["time"]?.jsonPrimitive?.content?.toLongOrNull(),
            url = props["url"]?.jsonPrimitive?.content,
        )
    }.sortedByDescending { it.timeMs ?: 0L }
    return rows.take(limit)
}

private fun formatEqTime(epochMs: Long): String =
    SimpleDateFormat.getDateTimeInstance(SimpleDateFormat.SHORT, SimpleDateFormat.SHORT, Locale.getDefault())
        .format(Date(epochMs))
