package com.rootrecord.kilauea.alerts.ui.weather

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.kilauea.alerts.data.local.KilaueaPreferences
import com.rootrecord.kilauea.alerts.data.repository.WeatherRepository
import com.rootrecord.kilauea.alerts.domain.BigIslandLocation
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject

data class WeatherListUiState(
    val rows: List<Pair<BigIslandLocation, JsonObject?>> = emptyList(),
    val gpsWeather: JsonObject? = null,
    val loading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class WeatherViewModel @Inject constructor(
    private val repo: WeatherRepository,
    private val prefs: KilaueaPreferences,
) : ViewModel() {

    private val _state = MutableStateFlow(WeatherListUiState())
    val state = _state.asStateFlow()

    val useMyLocationWeather =
        prefs.weatherUseMyLocation.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private var lastGpsLat: Double? = null
    private var lastGpsLon: Double? = null

    init {
        loadAll(false)
    }

    fun setUseMyLocationWeather(enabled: Boolean) {
        viewModelScope.launch {
            prefs.setWeatherUseMyLocation(enabled)
            if (!enabled) {
                lastGpsLat = null
                lastGpsLon = null
                _state.update { it.copy(gpsWeather = null) }
            }
        }
    }

    fun loadAll(force: Boolean) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            var err: String? = null
            val rows = BigIslandLocation.entries.map { loc ->
                val r = repo.observeOfflineFirst(loc.id, loc.latitude, loc.longitude, force)
                err = err ?: r.exceptionOrNull()?.message
                loc to r.getOrNull()
            }
            var gps = _state.value.gpsWeather
            val lat = lastGpsLat
            val lon = lastGpsLon
            if (prefs.weatherUseMyLocation.first() && lat != null && lon != null) {
                val r = repo.observeOfflineFirst("gps", lat, lon, force)
                err = err ?: r.exceptionOrNull()?.message
                gps = r.getOrNull()
                if (gps != null) prefs.setWeatherLastGps(lat, lon)
            }
            _state.update {
                it.copy(loading = false, rows = rows, gpsWeather = gps, error = err)
            }
        }
    }

    fun loadGpsWeather(lat: Double, lon: Double, force: Boolean = false) {
        viewModelScope.launch {
            if (!prefs.weatherUseMyLocation.first()) return@launch
            lastGpsLat = lat
            lastGpsLon = lon
            val r = repo.observeOfflineFirst("gps", lat, lon, force)
            r.getOrNull()?.let { prefs.setWeatherLastGps(lat, lon) }
            _state.update {
                it.copy(
                    gpsWeather = r.getOrNull(),
                    error = it.error ?: r.exceptionOrNull()?.message,
                )
            }
        }
    }
}
