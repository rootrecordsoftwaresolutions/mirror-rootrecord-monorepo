package com.rootrecord.blocknotes.ui.server

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.blocknotes.data.local.BlockNotesPreferences
import com.rootrecord.blocknotes.data.repository.FeaturedServerConfig
import com.rootrecord.blocknotes.data.repository.ServerMembership
import com.rootrecord.blocknotes.data.repository.ServerRepository
import com.rootrecord.blocknotes.domain.usecase.SyncDedicatedServerUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FeaturedServersUiState(
    val loading: Boolean = true,
    val signedIn: Boolean = false,
    val servers: List<FeaturedServerConfig> = emptyList(),
    val membership: ServerMembership? = null,
    val worldAddedMessage: String? = null,
    val error: String? = null,
)

@HiltViewModel
class FeaturedServersViewModel @Inject constructor(
    private val prefs: BlockNotesPreferences,
    private val serverRepository: ServerRepository,
    private val syncDedicatedServer: SyncDedicatedServerUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FeaturedServersUiState())
    val uiState: StateFlow<FeaturedServersUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null, worldAddedMessage = null) }
            val signedIn = prefs.authSignedIn.first()

            val servers: List<FeaturedServerConfig>
            val membership: ServerMembership?

            if (signedIn) {
                membership = serverRepository.fetchMembership().getOrNull()
                servers = membership?.servers?.takeIf { it.isNotEmpty() }
                    ?: serverRepository.fetchFeaturedServers().getOrElse { emptyList() }
            } else {
                membership = null
                servers = serverRepository.fetchFeaturedServers().getOrElse { emptyList() }
            }

            var worldMessage: String? = null
            if (signedIn) {
                syncDedicatedServer.sync().onSuccess { result ->
                    if (result.created) {
                        worldMessage = "Added ${result.config.defaultWorldName} to your worlds."
                    }
                }
            }

            _uiState.update {
                it.copy(
                    loading = false,
                    signedIn = signedIn,
                    servers = servers,
                    membership = membership,
                    worldAddedMessage = worldMessage,
                    error = if (servers.isEmpty()) "No connected servers found." else null,
                )
            }
        }
    }
}
