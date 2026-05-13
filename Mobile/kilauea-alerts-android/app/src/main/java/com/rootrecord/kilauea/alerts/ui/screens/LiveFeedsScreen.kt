package com.rootrecord.kilauea.alerts.ui.screens

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.rootrecord.kilauea.alerts.R
import com.rootrecord.kilauea.alerts.ui.components.DisclaimerBanner
import com.rootrecord.kilauea.alerts.ui.livefeeds.LiveFeedsViewModel

@Composable
fun LiveFeedsScreen(vm: LiveFeedsViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    val newBadge by vm.newBadge.collectAsState()
    val ctx = LocalContext.current

    LaunchedEffect(Unit) {
        vm.visitedTab()
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                DisclaimerBanner()
            }
            if (newBadge) {
                item {
                    Text(
                        "New camera or stream added to the list.",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
            item {
                Text(
                    "Official USGS webcams and streams, plus featured community creators. Watch opens in your browser or video app.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            item {
                Button(onClick = {
                    CustomTabsIntent.Builder().build()
                        .launchUrl(ctx, Uri.parse("https://www.usgs.gov/volcanoes/kilauea/webcams"))
                }) {
                    Text(stringResource(R.string.view_usgs_webcams))
                }
            }
            item {
                Button(onClick = {
                    CustomTabsIntent.Builder().build()
                        .launchUrl(ctx, Uri.parse("https://www.youtube.com/@TwoPineapples/live"))
                }) {
                    Row {
                        Icon(Icons.Default.OpenInNew, contentDescription = null)
                        Text(
                            "Watch TwoPineapples live (YouTube)",
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
            items(state.catalog?.feeds.orEmpty()) { feed ->
                Card {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(feed.title, style = MaterialTheme.typography.titleMedium)
                        Text(feed.description, style = MaterialTheme.typography.bodySmall)
                        feed.thumbnailUrl?.let { url ->
                            AsyncImage(
                                model = url,
                                contentDescription = null,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(140.dp),
                                contentScale = ContentScale.Crop,
                            )
                        }
                        Button(onClick = {
                            CustomTabsIntent.Builder().build()
                                .launchUrl(ctx, Uri.parse(feed.watchUrl))
                        }) {
                            Row {
                                Icon(Icons.Default.OpenInNew, contentDescription = null)
                                Text(
                                    stringResource(R.string.watch_live),
                                    modifier = Modifier.padding(start = 8.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
        FloatingActionButton(
            onClick = { vm.refresh(true) },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(24.dp),
        ) {
            Icon(Icons.Default.Refresh, contentDescription = "Refresh")
        }
    }
}
