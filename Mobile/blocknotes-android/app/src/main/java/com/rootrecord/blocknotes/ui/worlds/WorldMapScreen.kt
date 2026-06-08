package com.rootrecord.blocknotes.ui.worlds

import android.annotation.SuppressLint
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.rootrecord.blocknotes.R

@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WorldMapScreen(
    onBack: () -> Unit,
    viewModel: WorldMapViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    LaunchedEffect(uiState.waypoints, uiState.mapReady, uiState.mapMode) {
        val webView = webViewRef ?: return@LaunchedEffect
        if (uiState.mapMode != WorldMapMode.LIVE) return@LaunchedEffect
        if (!uiState.mapReady || uiState.waypoints.isEmpty()) return@LaunchedEffect
        viewModel.syncWaypoints(webView)
    }

    LaunchedEffect(uiState.mapMode, uiState.mapUrl, uiState.chunkbaseUrl) {
        val webView = webViewRef ?: return@LaunchedEffect
        when (uiState.mapMode) {
            WorldMapMode.LIVE -> if (uiState.mapUrl.isNotBlank()) webView.loadUrl(uiState.mapUrl)
            WorldMapMode.CHUNKBASE -> if (uiState.chunkbaseUrl.isNotBlank()) webView.loadUrl(uiState.chunkbaseUrl)
            WorldMapMode.GRID -> { /* native */ }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            TabRow(selectedTabIndex = uiState.mapMode.ordinal) {
                Tab(
                    selected = uiState.mapMode == WorldMapMode.GRID,
                    onClick = { viewModel.setMapMode(WorldMapMode.GRID) },
                    text = { Text(stringResource(R.string.world_map_tab_grid)) },
                )
                Tab(
                    selected = uiState.mapMode == WorldMapMode.LIVE,
                    onClick = { viewModel.setMapMode(WorldMapMode.LIVE) },
                    text = { Text(stringResource(R.string.world_map_tab_live)) },
                    enabled = uiState.hasLiveMap,
                )
                Tab(
                    selected = uiState.mapMode == WorldMapMode.CHUNKBASE,
                    onClick = { viewModel.setMapMode(WorldMapMode.CHUNKBASE) },
                    text = { Text(stringResource(R.string.world_map_tab_chunkbase)) },
                    enabled = uiState.hasChunkbase,
                )
            }

            when (uiState.mapMode) {
                WorldMapMode.GRID -> {
                    WorldGridMap(
                        waypoints = uiState.waypoints,
                        selectedCoordId = uiState.selectedCoordId,
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxSize(),
                    )
                }
                WorldMapMode.LIVE, WorldMapMode.CHUNKBASE -> {
                    val url = when (uiState.mapMode) {
                        WorldMapMode.LIVE -> uiState.mapUrl
                        WorldMapMode.CHUNKBASE -> uiState.chunkbaseUrl
                        else -> ""
                    }
                    if (url.isBlank()) {
                        Text(
                            when (uiState.mapMode) {
                                WorldMapMode.CHUNKBASE -> stringResource(R.string.world_map_chunkbase_no_seed)
                                else -> stringResource(R.string.world_map_missing_url)
                            },
                            modifier = Modifier.padding(16.dp),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    } else {
                        AndroidView(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth(),
                            factory = { ctx ->
                                WebView(ctx).apply {
                                    layoutParams = ViewGroup.LayoutParams(
                                        ViewGroup.LayoutParams.MATCH_PARENT,
                                        ViewGroup.LayoutParams.MATCH_PARENT,
                                    )
                                    isFocusable = true
                                    isFocusableInTouchMode = true
                                    settings.javaScriptEnabled = true
                                    settings.domStorageEnabled = true
                                    settings.loadsImagesAutomatically = true
                                    settings.mixedContentMode =
                                        WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                                    settings.builtInZoomControls = true
                                    settings.displayZoomControls = false
                                    settings.userAgentString = settings.userAgentString +
                                        " BlockNotes/1.0 (Block Notes; +https://rootrecord.info)"
                                    webChromeClient = WebChromeClient()
                                    webViewClient = object : WebViewClient() {
                                        override fun shouldOverrideUrlLoading(
                                            view: WebView?,
                                            request: WebResourceRequest?,
                                        ): Boolean {
                                            val target = request?.url?.toString().orEmpty()
                                            return !target.startsWith("http://") &&
                                                !target.startsWith("https://")
                                        }

                                        override fun onPageFinished(view: WebView?, url: String?) {
                                            super.onPageFinished(view, url)
                                            view?.requestFocus()
                                            viewModel.onMapPageLoaded(view)
                                        }
                                    }
                                    loadUrl(url)
                                    webViewRef = this
                                }
                            },
                            update = { view ->
                                webViewRef = view
                                view.requestLayout()
                            },
                        )
                    }
                }
            }

            MapWaypointChips(
                waypoints = uiState.waypoints,
                selectedCoordId = uiState.selectedCoordId,
                onSelect = { coordId ->
                    viewModel.selectWaypoint(coordId)
                    when (uiState.mapMode) {
                        WorldMapMode.GRID -> { /* grid centers via LaunchedEffect */ }
                        WorldMapMode.LIVE, WorldMapMode.CHUNKBASE ->
                            webViewRef?.let { viewModel.flyToWaypoint(it, coordId) }
                    }
                },
            )

            uiState.statusMessage?.let { msg ->
                Text(
                    msg,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            Text(
                when (uiState.mapMode) {
                    WorldMapMode.GRID -> stringResource(R.string.world_map_grid_hint)
                    WorldMapMode.CHUNKBASE -> stringResource(R.string.world_map_chunkbase_hint)
                    WorldMapMode.LIVE -> stringResource(R.string.world_map_dynmap_hint)
                },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun MapWaypointChips(
    waypoints: List<MapWaypointUi>,
    selectedCoordId: Long?,
    onSelect: (Long) -> Unit,
) {
    if (waypoints.isEmpty()) {
        Text(
            stringResource(R.string.world_map_no_waypoints),
            modifier = Modifier.padding(16.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    Text(
        stringResource(R.string.world_map_waypoints),
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        style = MaterialTheme.typography.titleSmall,
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        waypoints.forEach { wp ->
            FilterChip(
                selected = selectedCoordId == wp.coordId,
                onClick = { onSelect(wp.coordId) },
                label = {
                    Text(
                        "${wp.label} (${wp.x}, ${wp.y}, ${wp.z})",
                        maxLines = 1,
                    )
                },
            )
        }
    }
}
