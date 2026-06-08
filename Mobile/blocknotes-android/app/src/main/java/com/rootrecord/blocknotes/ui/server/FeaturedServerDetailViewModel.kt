package com.rootrecord.blocknotes.ui.server

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.blocknotes.data.local.BlockNotesPreferences
import com.rootrecord.blocknotes.data.repository.FeaturedServerConfig
import com.rootrecord.blocknotes.data.repository.McMMOStats
import com.rootrecord.blocknotes.data.repository.PlaytimeStats
import com.rootrecord.blocknotes.data.repository.ServerRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FeaturedServerDetailUiState(
    val loading: Boolean = true,
    val signedIn: Boolean = false,
    val server: FeaturedServerConfig? = null,
    val rootstatLinked: Boolean = false,
    val minecraftUsername: String? = null,
    val mcmmo: McMMOStats? = null,
    val playtime: PlaytimeStats? = null,
    val error: String? = null,
)

@HiltViewModel
class FeaturedServerDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val prefs: BlockNotesPreferences,
    private val serverRepository: ServerRepository,
) : ViewModel() {

    private val serverId: String = checkNotNull(savedStateHandle.get<String>("serverId"))

    private val _uiState = MutableStateFlow(FeaturedServerDetailUiState())
    val uiState: StateFlow<FeaturedServerDetailUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            val signedIn = prefs.authSignedIn.first()

            var server: FeaturedServerConfig? = null
            var rootstatLinked = false
            var minecraftUsername: String? = null
            var mcmmo: McMMOStats? = null
            var playtime: PlaytimeStats? = null

            if (signedIn) {
                val membership = serverRepository.fetchMembership().getOrNull()
                rootstatLinked = membership?.rootstatLinked == true
                minecraftUsername = membership?.minecraftUsername
                server = membership?.servers?.find { it.serverId == serverId }
                    ?: membership?.featuredServer?.takeIf { it.serverId == serverId }
                mcmmo = server?.mcmmo
                playtime = server?.playtime
                if (rootstatLinked && mcmmo == null) {
                    mcmmo = serverRepository.fetchMyMcmmoOnServer(serverId).getOrNull()
                }
            }

            if (server == null) {
                server = serverRepository.fetchFeaturedServers().getOrNull()
                    ?.find { it.serverId == serverId }
            }

            _uiState.update {
                it.copy(
                    loading = false,
                    signedIn = signedIn,
                    server = server,
                    rootstatLinked = rootstatLinked,
                    minecraftUsername = minecraftUsername,
                    mcmmo = mcmmo,
                    playtime = playtime,
                    error = if (server == null) "Server not found." else null,
                )
            }
        }
    }
}
