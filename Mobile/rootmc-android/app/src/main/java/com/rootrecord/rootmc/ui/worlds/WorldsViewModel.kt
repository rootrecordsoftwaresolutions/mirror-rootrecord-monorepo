package com.rootrecord.rootmc.ui.worlds

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.rootmc.data.local.RootMcPreferences
import com.rootrecord.rootmc.data.local.dao.NoteDao
import com.rootrecord.rootmc.data.local.entity.WorldEntity
import com.rootrecord.rootmc.data.local.entity.WorldPlayMode
import com.rootrecord.rootmc.data.repository.TimelineRepository
import com.rootrecord.rootmc.data.repository.WorldRepository
import com.rootrecord.rootmc.sync.CloudBackupCoordinator
import com.rootrecord.rootmc.util.MapUrlUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WorldsUiState(
    val worlds: List<WorldEntity> = emptyList(),
    val activeWorldId: Long? = null,
    val newWorldName: String = "",
    val newWorldSeed: String = "",
    val newPlayMode: WorldPlayMode = WorldPlayMode.SINGLEPLAYER,
    val newServerAddress: String = "",
    val newMapUrl: String = "",
    val showCreateDialog: Boolean = false,
)

data class WorldDetailUiState(
    val world: WorldEntity? = null,
    val noteCount: Int = 0,
    val notebookCount: Int = 0,
    val editName: String = "",
    val editSeed: String = "",
    val editGameVersion: String = "1.21",
    val editPlayMode: WorldPlayMode = WorldPlayMode.SINGLEPLAYER,
    val editServerAddress: String = "",
    val editMapUrl: String = "",
    val saveMessage: String? = null,
    val sharedOnProfile: Boolean = false,
)

@HiltViewModel
class WorldsViewModel @Inject constructor(
    private val worldRepository: WorldRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(WorldsUiState())
    val uiState: StateFlow<WorldsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            worldRepository.observeWorlds().collect { worlds ->
                _uiState.update {
                    it.copy(
                        worlds = worlds,
                        activeWorldId = worlds.find { w -> w.isActive }?.id,
                    )
                }
            }
        }
    }

    fun showCreateDialog() = _uiState.update { it.copy(showCreateDialog = true) }

    fun dismissCreateDialog() = _uiState.update {
        it.copy(
            showCreateDialog = false,
            newWorldName = "",
            newWorldSeed = "",
            newPlayMode = WorldPlayMode.SINGLEPLAYER,
            newServerAddress = "",
            newMapUrl = "",
        )
    }

    fun updateNewWorldName(name: String) = _uiState.update { it.copy(newWorldName = name) }
    fun updateNewWorldSeed(seed: String) = _uiState.update { it.copy(newWorldSeed = seed) }
    fun updateNewPlayMode(mode: WorldPlayMode) = _uiState.update { it.copy(newPlayMode = mode) }
    fun updateNewServerAddress(value: String) = _uiState.update { it.copy(newServerAddress = value) }
    fun updateNewMapUrl(value: String) = _uiState.update { it.copy(newMapUrl = value) }

    fun suggestNewMapUrl() {
        val suggested = MapUrlUtils.suggestMapUrl(_uiState.value.newServerAddress) ?: return
        _uiState.update { it.copy(newMapUrl = suggested) }
    }

    fun createWorld() {
        val state = _uiState.value
        val name = state.newWorldName.trim()
        if (name.isEmpty()) return
        val seed = state.newWorldSeed.trim().takeIf { it.isNotEmpty() }
        val server = state.newServerAddress.trim().takeIf { it.isNotEmpty() }
        val mapUrl = MapUrlUtils.normalizeMapUrl(state.newMapUrl).takeIf { it.isNotEmpty() }
        viewModelScope.launch {
            worldRepository.createWorld(
                name = name,
                seed = seed,
                playMode = state.newPlayMode.name,
                serverAddress = server,
                mapUrl = mapUrl,
                setActive = state.worlds.isEmpty(),
            )
            dismissCreateDialog()
        }
    }

    fun setActive(worldId: Long) {
        viewModelScope.launch {
            worldRepository.setActiveWorld(worldId)
        }
    }
}

@HiltViewModel
class WorldDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val worldRepository: WorldRepository,
    private val timelineRepository: TimelineRepository,
    private val noteDao: NoteDao,
    private val prefs: RootMcPreferences,
    private val cloudBackup: CloudBackupCoordinator,
) : ViewModel() {

    private val worldId: Long = checkNotNull(savedStateHandle.get<Long>("worldId"))

    private val _uiState = MutableStateFlow(WorldDetailUiState())
    val uiState: StateFlow<WorldDetailUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            worldRepository.observeWorlds().collect { worlds ->
                val world = worlds.find { it.id == worldId } ?: return@collect
                val notebooks = worldRepository.observeNotebooks(worldId).first()
                val notes = noteDao.observeByWorld(worldId).first()
                _uiState.update { state ->
                    val playMode = WorldPlayMode.entries.find { it.name == world.playMode }
                        ?: WorldPlayMode.SINGLEPLAYER
                    state.copy(
                        world = world,
                        noteCount = notes.count { !it.deleted },
                        notebookCount = notebooks.size,
                        editName = state.editName.ifBlank { world.name },
                        editSeed = state.editSeed.ifBlank { world.seed.orEmpty() },
                        editGameVersion = state.editGameVersion.ifBlank { world.gameVersion },
                        editPlayMode = if (state.world?.id != world.id) playMode else state.editPlayMode,
                        editServerAddress = state.editServerAddress.ifBlank { world.serverAddress.orEmpty() },
                        editMapUrl = state.editMapUrl.ifBlank { world.mapUrl.orEmpty() },
                    )
                }
            }
        }
        viewModelScope.launch {
            prefs.sharedWorldIds.collect { ids ->
                _uiState.update { it.copy(sharedOnProfile = worldId in ids) }
            }
        }
    }

    fun updateName(value: String) = _uiState.update { it.copy(editName = value, saveMessage = null) }
    fun updateSeed(value: String) = _uiState.update { it.copy(editSeed = value, saveMessage = null) }
    fun updateGameVersion(value: String) = _uiState.update { it.copy(editGameVersion = value, saveMessage = null) }
    fun updatePlayMode(mode: WorldPlayMode) = _uiState.update { it.copy(editPlayMode = mode, saveMessage = null) }
    fun updateServerAddress(value: String) = _uiState.update { it.copy(editServerAddress = value, saveMessage = null) }
    fun updateMapUrl(value: String) = _uiState.update { it.copy(editMapUrl = value, saveMessage = null) }

    fun suggestMapUrl() {
        val suggested = MapUrlUtils.suggestMapUrl(_uiState.value.editServerAddress) ?: return
        _uiState.update { it.copy(editMapUrl = suggested, saveMessage = null) }
    }

    fun saveChanges() {
        val world = _uiState.value.world ?: return
        val name = _uiState.value.editName.trim()
        if (name.isEmpty()) return
        viewModelScope.launch {
            val seed = _uiState.value.editSeed.trim().takeIf { it.isNotEmpty() }
            val version = _uiState.value.editGameVersion.trim().ifEmpty { world.gameVersion }
            val server = _uiState.value.editServerAddress.trim().takeIf { it.isNotEmpty() }
            val mapUrl = MapUrlUtils.normalizeMapUrl(_uiState.value.editMapUrl).takeIf { it.isNotEmpty() }
            worldRepository.updateWorld(
                world.copy(
                    name = name,
                    seed = seed,
                    gameVersion = version,
                    playMode = _uiState.value.editPlayMode.name,
                    serverAddress = server,
                    mapUrl = mapUrl,
                ),
            )
            timelineRepository.log(
                worldId = worldId,
                eventType = "world_updated",
                description = "Updated world details",
            )
            _uiState.update { it.copy(saveMessage = "Saved") }
        }
    }

    fun setActive() {
        viewModelScope.launch {
            worldRepository.setActiveWorld(worldId)
            _uiState.update { state ->
                state.copy(world = state.world?.copy(isActive = true))
            }
        }
    }

    fun setSharedOnProfile(shared: Boolean) {
        viewModelScope.launch {
            prefs.setWorldSharedOnProfile(worldId, shared)
            cloudBackup.scheduleBackupAfterLocalChange()
            _uiState.update { it.copy(sharedOnProfile = shared) }
        }
    }
}
