package com.rootrecord.rootmc.ui.worlds

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.rootmc.data.local.dao.WorldDao
import com.rootrecord.rootmc.data.repository.AiUnavailableException
import com.rootrecord.rootmc.data.repository.QuotaExceededException
import com.rootrecord.rootmc.data.repository.WorldAiCatalog
import com.rootrecord.rootmc.data.repository.WorldAiReportRepository
import com.rootrecord.rootmc.data.repository.WorldDataEmptyException
import com.rootrecord.rootmc.domain.usecase.BuildWorldAiPayloadUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WorldAiReportUiState(
    val worldName: String = "",
    val catalog: WorldAiCatalog? = null,
    val loading: Boolean = false,
    val generating: Boolean = false,
    val error: String? = null,
    val quotaLabel: String = "",
)

@HiltViewModel
class WorldAiReportViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val worldAiRepository: WorldAiReportRepository,
    private val payloadUseCase: BuildWorldAiPayloadUseCase,
    private val worldDao: WorldDao,
) : ViewModel() {

    private val worldId: Long = checkNotNull(savedStateHandle.get<Long>("worldId"))
    private val worldKey = payloadUseCase.worldKey(worldId)

    private val _uiState = MutableStateFlow(WorldAiReportUiState())
    val uiState: StateFlow<WorldAiReportUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            worldDao.getById(worldId)?.name?.let { name ->
                _uiState.update { it.copy(worldName = name) }
            }
            refresh()
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true) }
            val name = worldDao.getById(worldId)?.name ?: _uiState.value.worldName.ifBlank { "World" }
            worldAiRepository.fetchReports(worldKey, name)
                .onSuccess { catalog ->
                    _uiState.update {
                        it.copy(
                            loading = false,
                            catalog = catalog,
                            worldName = catalog.worldName.ifBlank { name },
                            quotaLabel = formatQuota(catalog),
                            error = null,
                        )
                    }
                }
                .onFailure { err ->
                    _uiState.update {
                        it.copy(loading = false, error = err.message ?: "Could not load reports.")
                    }
                }
        }
    }

    fun generateReport() {
        viewModelScope.launch {
            _uiState.update { it.copy(generating = true, error = null) }
            val payloadResult = payloadUseCase.build(worldId)
            if (payloadResult.isFailure) {
                _uiState.update {
                    it.copy(
                        generating = false,
                        error = payloadResult.exceptionOrNull()?.message ?: "Could not read world data.",
                    )
                }
                return@launch
            }
            val payload = payloadResult.getOrThrow()
            val worldName = payload.world.name
            worldAiRepository.generateReport(worldKey, worldName, payload)
                .onSuccess { catalog ->
                    _uiState.update {
                        it.copy(
                            generating = false,
                            catalog = catalog,
                            worldName = catalog.worldName,
                            quotaLabel = formatQuota(catalog),
                            error = null,
                        )
                    }
                }
                .onFailure { err ->
                    val message = when (err) {
                        is QuotaExceededException -> err.message
                        is WorldDataEmptyException -> err.message
                        is AiUnavailableException -> err.message
                        else -> err.message ?: "Report generation failed."
                    }
                    _uiState.update { it.copy(generating = false, error = message) }
                }
        }
    }

    private fun formatQuota(catalog: WorldAiCatalog): String {
        val q = catalog.quota
        return if (catalog.proUnlocked || q.tier == "pro") {
            val remaining = q.remainingThisMonth ?: (q.monthlyLimit?.minus(q.usedThisMonth) ?: 0)
            val limit = q.monthlyLimit ?: 100
            "Pro: $remaining of $limit reports left this month"
        } else {
            val remaining = q.remainingToday ?: (q.dailyLimit?.minus(q.usedToday) ?: 0)
            "Free: $remaining of ${q.dailyLimit ?: 1} report(s) left today"
        }
    }
}
