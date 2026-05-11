package com.rootrecord.kilauea.alerts.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.rootrecord.kilauea.alerts.ui.alerts.AlertsViewModel
import com.rootrecord.kilauea.alerts.ui.components.DisclaimerBanner
import com.rootrecord.kilauea.alerts.ui.util.formatUsgsNewestForAlerts
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun AlertsScreen(vm: AlertsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    val ctx = LocalContext.current

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { DisclaimerBanner() }
            item {
                Text(
                    "Volcano notices from the USGS and weather alerts for Hawaiʻi from the National Weather Service. Tap a card when you see a link.",
                    style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 22.sp),
                )
            }
            item {
                Text("Latest volcano notice (USGS)", style = MaterialTheme.typography.titleMedium)
                Text(
                    formatUsgsNewestForAlerts(state.volcano?.get("newest")),
                    modifier = Modifier.padding(top = 10.dp),
                    style = usgsReadableBodyStyle(),
                )
                Text(
                    "Full references → usgs.gov/volcanoes/kilauea",
                    modifier = Modifier
                        .padding(top = 8.dp)
                        .clickable {
                            ctx.startActivity(
                                Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse("https://www.usgs.gov/volcanoes/kilauea"),
                                ),
                            )
                        },
                    style = MaterialTheme.typography.titleSmall.copy(lineHeight = 24.sp),
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            item { Text("Hawaiʻi weather alerts (NWS)", style = MaterialTheme.typography.titleMedium) }
            val feats = state.nws?.get("features")?.jsonArray ?: JsonArray(emptyList())
            if (feats.isEmpty()) {
                item {
                    Text(
                        "No active weather alerts for Hawaiʻi right now.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            items(feats.size) { idx ->
                val f = feats[idx].jsonObject
                val props = f["properties"]?.jsonObject ?: JsonObject(emptyMap())
                val headline = props["headline"]?.jsonPrimitive?.content ?: props["event"]?.jsonPrimitive?.content
                val detail = props["description"]?.jsonPrimitive?.content
                val uri = props["uri"]?.jsonPrimitive?.content
                Card(
                    modifier = Modifier.clickable(enabled = uri != null) {
                        uri?.let { u ->
                            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)))
                        }
                    },
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(headline ?: "Alert", style = MaterialTheme.typography.titleSmall)
                        detail?.let {
                            Text(
                                it.take(400),
                                style = nwsReadableBodyStyle(),
                            )
                        }
                    }
                }
            }
        }
        FloatingActionButton(
            onClick = { vm.load(true) },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(24.dp),
        ) {
            Icon(Icons.Default.Refresh, contentDescription = "Refresh")
        }
    }
}

/** At least ~2× small body text (~12sp): larger type + generous line height for USGS excerpts. */
@Composable
private fun usgsReadableBodyStyle(): TextStyle {
    val bodyLarge = MaterialTheme.typography.bodyLarge
    return bodyLarge.copy(
        fontSize = (bodyLarge.fontSize.value * 1.5f).coerceAtLeast(24f).sp,
        lineHeight = (bodyLarge.fontSize.value * 2.5f).coerceAtLeast(38f).sp,
    )
}

@Composable
private fun nwsReadableBodyStyle(): TextStyle {
    val m = MaterialTheme.typography.bodyMedium
    return m.copy(
        fontSize = (m.fontSize.value * 1.35f).coerceAtLeast(17f).sp,
        lineHeight = (m.fontSize.value * 2.1f).coerceAtLeast(26f).sp,
    )
}
