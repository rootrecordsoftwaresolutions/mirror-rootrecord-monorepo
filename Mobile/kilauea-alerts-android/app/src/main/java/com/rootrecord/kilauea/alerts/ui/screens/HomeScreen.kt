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

                AirNowCurrentCard(airJson = state.airNowSummary, airErr = state.airNowError)

                AirQualityArchiveCard(aqsJson = state.aqsSummary, aqsErr = state.aqsError)

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
private fun AirNowCurrentCard(airJson: JsonObject?, airErr: String?) {
    val ctx = LocalContext.current
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Current air quality (AirNow)", style = MaterialTheme.typography.titleMedium)
            Text(
                "Hourly readings from EPA AirNow monitors near Volcano Village (50 mi search). " +
                    "Preliminary — not a dedicated vog model.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(
                onClick = {
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.airnow.gov/")))
                },
            ) {
                Text("Open AirNow.gov")
            }
            when {
                airErr != null && airJson == null -> {
                    val msg = when {
                        airErr.contains("503", ignoreCase = true) ||
                            airErr.contains("airnow_api_key", ignoreCase = true) ->
                            "Live air data isn’t enabled on the API yet (AirNow API key on the Worker)."
                        else -> airErr
                    }
                    Text(msg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                airJson == null -> Text("Loading…", style = MaterialTheme.typography.bodyMedium)
                else -> {
                    val lines = summarizeAirNowObservations(airJson)
                    if (lines.isEmpty()) {
                        Text(
                            "No observations returned for this location (try again later).",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        lines.forEachIndexed { i, line ->
                            Text(line, style = MaterialTheme.typography.bodySmall)
                            if (i < lines.lastIndex) {
                                HorizontalDivider(Modifier.padding(vertical = 4.dp))
                            }
                        }
                    }
                    airJson["observed_at_note"]?.jsonPrimitive?.content?.let { note ->
                        Text(note, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

private fun airNowCategoryName(obj: JsonObject): String? {
    val cat = obj["Category"] ?: return null
    val co = cat as? JsonObject ?: return null
    return co["Name"]?.jsonPrimitive?.content
}

private fun summarizeAirNowObservations(wrap: JsonObject): List<String> {
    val arr = wrap["observations"]?.jsonArray ?: return emptyList()
    return arr.mapNotNull { el ->
        val o = el as? JsonObject ?: return@mapNotNull null
        val param = o["ParameterName"]?.jsonPrimitive?.content ?: return@mapNotNull null
        val aqi = o["AQI"]?.jsonPrimitive?.content ?: "—"
        val cat = airNowCategoryName(o)?.takeIf { it.isNotBlank() }
        val area = o["ReportingArea"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
        val date = o["DateObserved"]?.jsonPrimitive?.content?.trim()?.takeIf { it.isNotBlank() }
        val hour = o["HourObserved"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
        val tz = o["LocalTimeZone"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
        buildString {
            append("$param — AQI $aqi")
            if (cat != null) append(" ($cat)")
            if (area != null) append(" · $area")
            if (date != null) {
                append(" · $date")
                if (hour != null) append(" $hour")
                if (tz != null) append(" $tz")
            }
        }
    }
}

@Composable
private fun AirQualityArchiveCard(aqsJson: JsonObject?, aqsErr: String?) {
    val ctx = LocalContext.current
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Big Island air — EPA archive", style = MaterialTheme.typography.titleMedium)
            Text(
                "Daily summaries from the US EPA Air Quality System (PM2.5, O₃, SO₂). AQS is validated " +
                    "archive data — often months behind what you smell or see outside. For hourly “right now” AQI, use the AirNow card above.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(
                onClick = {
                    ctx.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("https://aqs.epa.gov/aqsweb/documents/data_api.html")),
                    )
                },
            ) {
                Text("EPA AQS documentation")
            }
            when {
                aqsErr != null && aqsJson == null -> {
                    val msg = when {
                        aqsErr.contains("503", ignoreCase = true) ||
                            aqsErr.contains("aqs_credentials", ignoreCase = true) ->
                            "Air archive isn’t enabled on the API yet (EPA signup + Worker secrets)."
                        else -> aqsErr
                    }
                    Text(msg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                aqsJson == null -> Text("Loading…", style = MaterialTheme.typography.bodyMedium)
                else -> {
                    val lines = summarizeAqsRows(aqsJson)
                    if (lines.isEmpty()) {
                        Text(
                            "No monitor rows in this window (AQS may still be ingesting, or nothing matched).",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        lines.forEachIndexed { i, line ->
                            Text(line, style = MaterialTheme.typography.bodySmall)
                            if (i < lines.lastIndex) {
                                HorizontalDivider(Modifier.padding(vertical = 4.dp))
                            }
                        }
                    }
                    val qw = aqsJson["query_window"]?.jsonObject
                    val b = qw?.get("bdate")?.jsonPrimitive?.content
                    val e = qw?.get("edate")?.jsonPrimitive?.content
                    if (b != null && e != null) {
                        Text(
                            "Query window: $b → $e",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

private fun summarizeAqsRows(wrap: JsonObject): List<String> {
    val arr = wrap["rows_trimmed"]?.jsonArray ?: return emptyList()
    data class Row(val date: String, val pcode: String, val name: String, val value: String, val units: String)
    val rows = arr.mapNotNull { el ->
        val o = el as? JsonObject ?: return@mapNotNull null
        val date = o["date_local"]?.jsonPrimitive?.content
            ?: o["date_of_last_change"]?.jsonPrimitive?.content
            ?: return@mapNotNull null
        val name = o["parameter_name"]?.jsonPrimitive?.content ?: return@mapNotNull null
        val pcode = o["parameter_code"]?.jsonPrimitive?.content ?: ""
        val mean = o["arithmetic_mean"]?.jsonPrimitive?.content
        val mx = o["first_max_value"]?.jsonPrimitive?.content
        val sample = o["sample_measurement"]?.jsonPrimitive?.content
        val value = listOf(mean, mx, sample).firstOrNull { !it.isNullOrBlank() } ?: return@mapNotNull null
        val units = o["units_of_measure"]?.jsonPrimitive?.content
            ?: o["unit_of_measure"]?.jsonPrimitive?.content
            ?: ""
        Row(date, pcode, name, value, units)
    }
    return rows
        .groupBy { it.pcode.ifBlank { it.name } }
        .values
        .mapNotNull { list -> list.maxWithOrNull(compareBy { it.date }) }
        .sortedByDescending { it.date }
        .take(8)
        .map { r ->
            val u = r.units.trim().ifEmpty { "" } else " ${r.units.trim()}"
            "${r.date} · ${r.name.take(42)} — ${r.value}$u"
        }
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
