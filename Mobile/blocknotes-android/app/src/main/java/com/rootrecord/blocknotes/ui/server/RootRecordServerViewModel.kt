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

data class RootRecordServerUiState(
    val loading: Boolean = true,
    val signedIn: Boolean = false,
    val config: FeaturedServerConfig? = null,
    val membership: ServerMembership? = null,
    val linkedWorldId: Long? = null,
    val worldAddedMessage: String? = null,
    val error: String? = null,
)

@HiltViewModel
class RootRecordServerViewModel @Inject constructor(
    private val prefs: BlockNotesPreferences,
    private val serverRepository: ServerRepository,
    private val syncDedicatedServer: SyncDedicatedServerUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RootRecordServerUiState())
    val uiState: StateFlow<RootRecordServerUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null, worldAddedMessage = null) }
            val signedIn = prefs.authSignedIn.first()
            val config = serverRepository.fetchFeaturedServerConfig().getOrNull()
            val membership = if (signedIn) {
                serverRepository.fetchMembership().getOrNull()
            } else {
                null
            }
            var worldMessage: String? = null
            var worldId: Long? = null
            if (signedIn && config != null) {
                syncDedicatedServer.sync().onSuccess { result ->
                    worldId = result.worldId
                    if (result.created) {
                        worldMessage = "Added ${config.defaultWorldName} to your worlds."
                    }
                }
            }
            _uiState.update {
                it.copy(
                    loading = false,
                    signedIn = signedIn,
                    config = config,
                    membership = membership,
                    linkedWorldId = worldId,
                    worldAddedMessage = worldMessage,
                    error = if (config == null) "Could not load server info." else null,
                )
            }
        }
    }
}
