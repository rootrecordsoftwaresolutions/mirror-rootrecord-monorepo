package com.rootrecord.rootmc.ui.worlds

import android.webkit.WebView
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.rootmc.data.local.dao.CoordinateDao
import com.rootrecord.rootmc.data.local.dao.WorldDao
import com.rootrecord.rootmc.data.local.entity.CoordinateEntity
import com.rootrecord.rootmc.data.local.entity.MinecraftDimension
import com.rootrecord.rootmc.util.ChunkbaseUrlUtils
import com.rootrecord.rootmc.util.DynmapJs
import com.rootrecord.rootmc.util.MapUrlUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class WorldMapMode {
    GRID,
    LIVE,
    CHUNKBASE,
}

data class MapWaypointUi(
    val coordId: Long,
    val label: String,
    val x: Int,
    val y: Int,
    val z: Int,
    val dimension: String,
)

data class WorldMapUiState(
    val title: String = "Map",
    val mapMode: WorldMapMode = WorldMapMode.GRID,
    val mapUrl: String = "",
    val seed: String? = null,
    val gameVersion: String = "1.21",
    val hasLiveMap: Boolean = false,
    val hasChunkbase: Boolean = false,
    val chunkbaseUrl: String = "",
    val waypoints: List<MapWaypointUi> = emptyList(),
    val selectedCoordId: Long? = null,
    val mapReady: Boolean = false,
    val statusMessage: String? = null,
)

@HiltViewModel
class WorldMapViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    worldDao: WorldDao,
    coordinateDao: CoordinateDao,
) : ViewModel() {

    private val worldId: Long = checkNotNull(savedStateHandle.get<Long>("worldId"))

    private val mapMode = MutableStateFlow(WorldMapMode.GRID)
    private val mapReady = MutableStateFlow(false)
    private val selectedCoordId = MutableStateFlow<Long?>(null)
    private val statusMessage = MutableStateFlow<String?>(null)

    val uiState: StateFlow<WorldMapUiState> = combine(
        combine(
            worldDao.observeAll(),
            coordinateDao.observeByWorld(worldId),
            mapMode,
        ) { worlds, coords, mode -> Triple(worlds, coords, mode) },
        combine(mapReady, selectedCoordId, statusMessage) { ready, selected, status ->
            Triple(ready, selected, status)
        },
    ) { data, meta ->
        val (worlds, coords, mode) = data
        val (ready, selected, status) = meta
        val world = worlds.find { it.id == worldId }
        val mapUrl = MapUrlUtils.normalizeMapUrl(world?.mapUrl.orEmpty())
        val seed = world?.seed
        val wps = coords.map { it.toMapWaypointUi() }
        val selWp = selected?.let { id -> wps.find { it.coordId == id } }
        val chunkbase = ChunkbaseUrlUtils.buildSeedMapUrl(
            seedRaw = seed,
            gameVersion = world?.gameVersion,
            dimension = selWp?.dimension ?: MinecraftDimension.OVERWORLD.name,
            centerX = selWp?.x ?: 0,
            centerZ = selWp?.z ?: 0,
        ).orEmpty()
        WorldMapUiState(
            title = world?.name?.let { "$it map" } ?: "Map",
            mapMode = mode,
            mapUrl = mapUrl,
            seed = seed,
            gameVersion = world?.gameVersion ?: "1.21",
            hasLiveMap = mapUrl.isNotBlank(),
            hasChunkbase = ChunkbaseUrlUtils.hasUsableSeed(seed),
            chunkbaseUrl = chunkbase,
            waypoints = wps,
            selectedCoordId = selected,
            mapReady = ready,
            statusMessage = status,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), WorldMapUiState())

    init {
        viewModelScope.launch {
            worldDao.observeAll().collect { worlds ->
                val world = worlds.find { it.id == worldId } ?: return@collect
                val url = MapUrlUtils.normalizeMapUrl(world.mapUrl.orEmpty())
                if (url.isBlank() && mapMode.value == WorldMapMode.LIVE) {
                    mapMode.value = WorldMapMode.GRID
                }
            }
        }
    }

    fun setMapMode(mode: WorldMapMode) {
        when (mode) {
            WorldMapMode.LIVE -> {
                if (uiState.value.mapUrl.isBlank()) {
                    statusMessage.value = "Add a live map URL in world settings, or use Grid map."
                    return
                }
            }
            WorldMapMode.CHUNKBASE -> {
                if (!uiState.value.hasChunkbase) {
                    statusMessage.value = "Add a world seed in settings to use Chunkbase (optional)."
                    return
                }
            }
            WorldMapMode.GRID -> { /* always available */ }
        }
        mapMode.value = mode
        mapReady.value = false
        statusMessage.value = null
    }

    fun onMapPageLoaded(webView: WebView?) {
        mapReady.value = true
        if (webView != null && mapMode.value == WorldMapMode.LIVE) {
            viewModelScope.launch {
                syncWaypoints(webView)
            }
        }
    }

    fun selectWaypoint(coordId: Long) {
        selectedCoordId.value = coordId
        statusMessage.value = null
    }

    fun flyToWaypoint(webView: WebView, coordId: Long) {
        val wp = uiState.value.waypoints.find { it.coordId == coordId } ?: return
        when (mapMode.value) {
            WorldMapMode.GRID -> {
                selectWaypoint(coordId)
                statusMessage.value = "Centered on ${wp.label}"
            }
            WorldMapMode.CHUNKBASE -> {
                selectWaypoint(coordId)
                val url = ChunkbaseUrlUtils.buildSeedMapUrl(
                    seedRaw = uiState.value.seed,
                    gameVersion = uiState.value.gameVersion,
                    dimension = wp.dimension,
                    centerX = wp.x,
                    centerZ = wp.z,
                ).orEmpty()
                if (url.isNotBlank()) {
                    webView.loadUrl(url)
                    statusMessage.value = "Centered on ${wp.label}"
                }
            }
            WorldMapMode.LIVE -> {
                val script = DynmapJs.flyToScript(wp.x, wp.y, wp.z, wp.dimension)
                webView.evaluateJavascript(script) { result ->
                    val cleaned = result?.trim('"').orEmpty()
                    statusMessage.value = when (cleaned) {
                        "ok" -> "Centered on ${wp.label}"
                        "loading" -> "Map still loading — try again in a moment"
                        "unsupported", "no_map" -> "Live map is not Dynmap — try Grid map tab"
                        else -> if (cleaned.isNotBlank()) cleaned else null
                    }
                }
            }
        }
    }

    fun syncWaypoints(webView: WebView) {
        if (mapMode.value != WorldMapMode.LIVE) return
        val wps = uiState.value.waypoints.map { wp ->
            DynmapJs.WaypointJs(
                id = "bn_${wp.coordId}",
                label = wp.label.ifBlank { "Waypoint" },
                x = wp.x,
                y = wp.y,
                z = wp.z,
                world = DynmapJs.dimensionToMapWorld(wp.dimension),
            )
        }
        if (wps.isEmpty()) return
        val script = DynmapJs.installWaypointsScript(wps)
        webView.evaluateJavascript(script) { result ->
            val cleaned = result?.trim('"').orEmpty()
            statusMessage.value = when (cleaned) {
                "ok" -> "${wps.size} waypoint(s) on live map"
                "no_markers", "no_set" -> "Server map loaded — not Dynmap (use Grid map)"
                else -> statusMessage.value
            }
        }
    }

    private fun CoordinateEntity.toMapWaypointUi() = MapWaypointUi(
        coordId = id,
        label = label.ifBlank { "Coord" },
        x = x,
        y = y,
        z = z,
        dimension = dimension,
    )
}
