package com.rootrecord.kilauea.alerts.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.kilauea.alerts.data.repository.AirNowRepository
import com.rootrecord.kilauea.alerts.data.repository.AqsRepository
import com.rootrecord.kilauea.alerts.data.repository.EarthquakeRepository
import com.rootrecord.kilauea.alerts.data.repository.UsgVolcanoRepository
import android.content.Context
import com.rootrecord.kilauea.alerts.data.repository.WeatherRepository
import com.rootrecord.kilauea.alerts.domain.BigIslandLocation
import com.rootrecord.kilauea.alerts.work.WorkEnqueue
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject

data class HomeUiState(
    val loading: Boolean = false,
    val volcano: JsonObject? = null,
    val earthquakes: JsonObject? = null,
    val volcanoVillageWeather: JsonObject? = null,
    /** AirNow current observations near Volcano Village — optional until Worker has `AIRNOW_API_KEY`. */
    val airNowSummary: JsonObject? = null,
    val airNowError: String? = null,
    /** EPA AQS daily summaries (Hawaiʻi County) — optional; null if Worker has no credentials or fetch failed. */
    val aqsSummary: JsonObject? = null,
    val aqsError: String? = null,
    val error: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val volcanoRepo: UsgVolcanoRepository,
    private val eqRepo: EarthquakeRepository,
    private val weatherRepo: WeatherRepository,
    private val airNowRepo: AirNowRepository,
    private val aqsRepo: AqsRepository,
    @param:ApplicationContext private val appContext: Context,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state = _state.asStateFlow()

    private var ticker: Job? = null

    init {
        refresh(force = false)
        // Soft refresh: keep USGS/FDSN reasonably fresh without `?refresh=1` on the dashboard
        // (that bypasses Worker D1 and retriggers AccuWeather). User FAB still uses force = true.
        ticker = viewModelScope.launch {
            while (true) {
                delay(2 * 60 * 1000L)
                refresh(force = false)
            }
        }
    }

    override fun onCleared() {
        ticker?.cancel()
        super.onCleared()
    }

    fun refresh(force: Boolean) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, aqsError = null, airNowError = null) }
            val v = volcanoRepo.offlineFirst(force)
            val eq = eqRepo.offlineFirst(force)
            val vv = BigIslandLocation.VolcanoVillage
            val wx = weatherRepo.observeOfflineFirst(vv.id, vv.latitude, vv.longitude, force)
            val air = airNowRepo.offlineFirst(force)
            val aqs = aqsRepo.offlineFirst(force)
            _state.update {
                it.copy(
                    loading = false,
                    volcano = v.getOrNull(),
                    earthquakes = eq.getOrNull(),
                    volcanoVillageWeather = wx.getOrNull(),
                    airNowSummary = air.getOrNull(),
                    airNowError = air.exceptionOrNull()?.message,
                    aqsSummary = aqs.getOrNull(),
                    aqsError = aqs.exceptionOrNull()?.message,
                    error = listOfNotNull(
                        v.exceptionOrNull()?.message,
                        eq.exceptionOrNull()?.message,
                        wx.exceptionOrNull()?.message,
                    ).firstOrNull(),
                )
            }
            WorkEnqueue.enqueueAlertPollIfDue(appContext)
        }
    }
}
