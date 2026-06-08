package com.rootrecord.blocknotes.ui.worlds

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.rootrecord.blocknotes.R
import com.rootrecord.blocknotes.data.local.entity.WorldPlayMode
import com.rootrecord.blocknotes.ui.components.MinecraftCard
import com.rootrecord.blocknotes.util.EntryTimestamp

@Composable
fun WorldsScreen(
    onOpenWorld: (Long) -> Unit,
    viewModel: WorldsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { viewModel.showCreateDialog() }) {
                Icon(Icons.Default.Add, contentDescription = "New world")
            }
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(top = 16.dp, bottom = 88.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text(stringResource(R.string.nav_worlds), style = MaterialTheme.typography.headlineSmall)
            }
            items(uiState.worlds, key = { it.id }) { world ->
                MinecraftCard(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onOpenWorld(world.id) },
                ) {
                    Text(world.name, style = MaterialTheme.typography.titleMedium)
                    val modeLabel = if (world.playMode == WorldPlayMode.MULTIPLAYER.name) {
                        stringResource(R.string.world_mode_multiplayer)
                    } else {
                        stringResource(R.string.world_mode_singleplayer)
                    }
                    Text(
                        modeLabel,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    world.serverAddress?.takeIf { it.isNotBlank() }?.let { server ->
                        Text(
                            stringResource(R.string.world_server_label, server),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    world.seed?.let { seed ->
                        Text(
                            stringResource(R.string.world_seed_label, seed),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        if (world.isActive) stringResource(R.string.world_active) else stringResource(R.string.world_tap_details),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    EntryTimestamp(epochMillis = world.createdAt, prefix = "Created")
                }
            }
        }
    }

    if (uiState.showCreateDialog) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissCreateDialog() },
            title = { Text(stringResource(R.string.world_create_title)) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = uiState.newWorldName,
                        onValueChange = viewModel::updateNewWorldName,
                        label = { Text(stringResource(R.string.world_name_label)) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    PlayModeSelector(
                        selected = uiState.newPlayMode,
                        onSelect = viewModel::updateNewPlayMode,
                    )
                    if (uiState.newPlayMode == WorldPlayMode.MULTIPLAYER) {
                        OutlinedTextField(
                            value = uiState.newServerAddress,
                            onValueChange = viewModel::updateNewServerAddress,
                            label = { Text(stringResource(R.string.world_server_address_label)) },
                            placeholder = { Text(stringResource(R.string.world_server_address_hint)) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = uiState.newMapUrl,
                                onValueChange = viewModel::updateNewMapUrl,
                                label = { Text(stringResource(R.string.world_map_url_label)) },
                                placeholder = { Text(stringResource(R.string.world_map_url_hint)) },
                                modifier = Modifier.weight(1f),
                            )
                        }
                        TextButton(onClick = viewModel::suggestNewMapUrl) {
                            Text(stringResource(R.string.world_map_url_suggest))
                        }
                    }
                    OutlinedTextField(
                        value = uiState.newWorldSeed,
                        onValueChange = viewModel::updateNewWorldSeed,
                        label = { Text(stringResource(R.string.world_seed_optional)) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.createWorld() }) { Text(stringResource(R.string.world_create_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissCreateDialog() }) { Text(stringResource(R.string.world_create_cancel)) }
            },
        )
    }
}

@Composable
private fun PlayModeSelector(
    selected: WorldPlayMode,
    onSelect: (WorldPlayMode) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(stringResource(R.string.world_play_mode_label), style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = selected == WorldPlayMode.SINGLEPLAYER,
                onClick = { onSelect(WorldPlayMode.SINGLEPLAYER) },
                label = { Text(stringResource(R.string.world_mode_singleplayer)) },
            )
            FilterChip(
                selected = selected == WorldPlayMode.MULTIPLAYER,
                onClick = { onSelect(WorldPlayMode.MULTIPLAYER) },
                label = { Text(stringResource(R.string.world_mode_multiplayer)) },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorldDetailScreen(
    onBack: () -> Unit,
    onOpenAiReport: () -> Unit,
    onOpenMap: () -> Unit,
    viewModel: WorldDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.world?.name ?: stringResource(R.string.world_detail_title)) },
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
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.world_stats_notes, uiState.noteCount), style = MaterialTheme.typography.bodyLarge)
            Text(stringResource(R.string.world_stats_notebooks, uiState.notebookCount), style = MaterialTheme.typography.bodyLarge)

            OutlinedTextField(
                value = uiState.editName,
                onValueChange = viewModel::updateName,
                label = { Text(stringResource(R.string.world_name_label)) },
                modifier = Modifier.fillMaxWidth(),
            )

            PlayModeSelector(
                selected = uiState.editPlayMode,
                onSelect = viewModel::updatePlayMode,
            )

            if (uiState.editPlayMode == WorldPlayMode.MULTIPLAYER) {
                OutlinedTextField(
                    value = uiState.editServerAddress,
                    onValueChange = viewModel::updateServerAddress,
                    label = { Text(stringResource(R.string.world_server_address_label)) },
                    placeholder = { Text(stringResource(R.string.world_server_address_hint)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = uiState.editMapUrl,
                    onValueChange = viewModel::updateMapUrl,
                    label = { Text(stringResource(R.string.world_map_url_label)) },
                    placeholder = { Text(stringResource(R.string.world_map_url_hint)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                TextButton(onClick = viewModel::suggestMapUrl) {
                    Text(stringResource(R.string.world_map_url_suggest))
                }
                Text(
                    stringResource(R.string.world_map_url_help),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            OutlinedTextField(
                value = uiState.editSeed,
                onValueChange = viewModel::updateSeed,
                label = { Text(stringResource(R.string.world_seed_label_plain)) },
                supportingText = { Text(stringResource(R.string.world_seed_help)) },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = uiState.editGameVersion,
                onValueChange = viewModel::updateGameVersion,
                label = { Text(stringResource(R.string.world_version_label)) },
                modifier = Modifier.fillMaxWidth(),
            )

            TextButton(onClick = { viewModel.saveChanges() }) {
                Text(stringResource(R.string.world_save_changes))
            }
            uiState.saveMessage?.let { msg ->
                Text(msg, color = MaterialTheme.colorScheme.primary)
            }

            if (uiState.world?.isActive != true) {
                TextButton(onClick = { viewModel.setActive() }) {
                    Text(stringResource(R.string.world_set_active))
                }
            } else {
                Text(stringResource(R.string.world_is_active), color = MaterialTheme.colorScheme.primary)
            }

            OutlinedButton(
                onClick = onOpenMap,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Map, contentDescription = null)
                Text(
                    stringResource(R.string.world_open_map),
                    modifier = Modifier.padding(start = 8.dp),
                )
            }

            Text(stringResource(R.string.world_share_on_profile), style = MaterialTheme.typography.titleSmall)
            Switch(
                checked = uiState.sharedOnProfile,
                onCheckedChange = viewModel::setSharedOnProfile,
            )
            Text(
                stringResource(R.string.world_share_on_profile_help),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(
                onClick = onOpenAiReport,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.world_ai_open))
            }
        }
    }
}
