package com.rootrecord.rootmc.ui.server

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.rootmc.data.repository.AiUnavailableException
import com.rootrecord.rootmc.data.repository.QuotaExceededException
import com.rootrecord.rootmc.data.repository.WorldAiCatalog
import com.rootrecord.rootmc.data.repository.WorldAiReportRepository
import com.rootrecord.rootmc.data.repository.WorldDataEmptyException
import com.rootrecord.rootmc.domain.usecase.BuildServerAiPayloadUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ServerAiReportUiState(
    val serverName: String = "",
    val catalog: WorldAiCatalog? = null,
    val loading: Boolean = false,
    val generating: Boolean = false,
    val error: String? = null,
    val quotaLabel: String = "",
)

@HiltViewModel
class ServerAiReportViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val worldAiRepository: WorldAiReportRepository,
    private val buildServerPayload: BuildServerAiPayloadUseCase,
) : ViewModel() {

    private val serverId: String = checkNotNull(savedStateHandle.get<String>("serverId"))
    private val serverAddress: String = savedStateHandle.get<String>("serverAddress").orEmpty()

    private val _uiState = MutableStateFlow(ServerAiReportUiState())
    val uiState: StateFlow<ServerAiReportUiState> = _uiState.asStateFlow()

    init {
        savedStateHandle.get<String>("serverName")?.let { name ->
            _uiState.update { it.copy(serverName = name) }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true) }
            val name = _uiState.value.serverName.ifBlank { serverId }
            worldAiRepository.fetchServerReports(serverId, name)
                .onSuccess { catalog ->
                    _uiState.update {
                        it.copy(
                            loading = false,
                            catalog = catalog,
                            serverName = catalog.worldName.ifBlank { name },
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
            val serverName = _uiState.value.serverName.ifBlank { serverId }
            val worlds = if (serverAddress.isNotBlank()) {
                buildServerPayload.buildForServerAddress(serverAddress).getOrDefault(emptyList())
            } else {
                emptyList()
            }
            worldAiRepository.generateServerReport(serverId, serverName, worlds)
                .onSuccess { catalog ->
                    _uiState.update {
                        it.copy(
                            generating = false,
                            catalog = catalog,
                            serverName = catalog.worldName,
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
