package com.rootrecord.blocknotes.ui.server

import android.content.Intent
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.rootrecord.blocknotes.R
import com.rootrecord.blocknotes.data.repository.McMMOStats
import com.rootrecord.blocknotes.data.repository.PlaytimeStats
import com.rootrecord.blocknotes.ui.components.MinecraftCard

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FeaturedServerDetailScreen(
    onBack: () -> Unit,
    onAuth: () -> Unit,
    onOpenWorlds: () -> Unit,
    onOpenRealm: () -> Unit,
    viewModel: FeaturedServerDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.server?.name ?: stringResource(R.string.featured_servers_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.server_refresh))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            uiState.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
            }

            uiState.server?.let { server ->
                MinecraftCard(modifier = Modifier.fillMaxWidth()) {
                    Text(server.name, style = MaterialTheme.typography.titleLarge)
                    Text(stringResource(R.string.server_address_label, server.address))
                    Text(stringResource(R.string.server_world_label, server.defaultWorldName))
                    Text(stringResource(R.string.server_version_label, server.gameVersion))
                    ServerStatusRow(server)
                }

                MinecraftCard(modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.playtime_section_title), style = MaterialTheme.typography.titleMedium)
                    Text(
                        stringResource(R.string.mcmmo_per_server_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                    when {
                        !uiState.signedIn -> Text(stringResource(R.string.playtime_sign_in_required))
                        uiState.playtime != null -> PlaytimeDetailPanel(uiState.playtime!!)
                        else -> Text(stringResource(R.string.playtime_none_on_server))
                    }
                }

                MinecraftCard(modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.mcmmo_section_title), style = MaterialTheme.typography.titleMedium)
                    Text(
                        stringResource(R.string.mcmmo_per_server_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )

                    when {
                        !uiState.signedIn -> {
                            Text(stringResource(R.string.mcmmo_sign_in_required))
                            Button(onClick = onAuth, modifier = Modifier.padding(top = 8.dp)) {
                                Text(stringResource(R.string.sign_in))
                            }
                        }
                        !uiState.rootstatLinked -> {
                            Text(stringResource(R.string.server_link_required))
                            Button(
                                onClick = {
                                    CustomTabsIntent.Builder().build()
                                        .launchUrl(context, server.verifyUrl.toUri())
                                },
                                modifier = Modifier.padding(top = 8.dp),
                            ) {
                                Icon(Icons.Default.Link, contentDescription = null)
                                Text(stringResource(R.string.server_open_verify))
                            }
                        }
                        uiState.mcmmo != null -> {
                            McMMODetailPanel(
                                mcmmo = uiState.mcmmo!!,
                                minecraftUsername = uiState.minecraftUsername,
                            )
                        }
                        else -> {
                            Text(stringResource(R.string.mcmmo_none_on_server))
                            Text(
                                stringResource(R.string.mcmmo_sync_hint),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                if (uiState.signedIn && server.belongsToServer) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = onOpenWorlds) {
                            Text(stringResource(R.string.server_open_worlds))
                        }
                        OutlinedButton(onClick = onOpenRealm) {
                            Text(stringResource(R.string.realm_title))
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun McMMODetailPanel(
    mcmmo: McMMOStats,
    minecraftUsername: String?,
) {
    if (minecraftUsername != null) {
        Text(stringResource(R.string.server_linked_player, minecraftUsername))
    }
    Text(
        stringResource(R.string.mcmmo_power_level, mcmmo.powerLevel),
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(top = 4.dp),
    )
    mcmmo.syncedAt?.let {
        Text(
            stringResource(R.string.mcmmo_last_synced, it),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.padding(top = 8.dp),
    ) {
        mcmmo.skills.entries
            .sortedByDescending { it.value }
            .forEach { (skill, level) ->
                MinecraftCard {
                    Text(formatSkillName(skill), style = MaterialTheme.typography.labelSmall)
                    Text("$level", style = MaterialTheme.typography.titleMedium)
                }
            }
    }
}

@Composable
private fun PlaytimeDetailPanel(playtime: PlaytimeStats) {
    Text(
        stringResource(R.string.playtime_total, formatPlaytime(playtime.totalSeconds)),
        style = MaterialTheme.typography.titleMedium,
    )
    playtime.firstJoinAt?.let {
        Text(
            stringResource(R.string.playtime_first_join, it),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    playtime.lastLoginAt?.let {
        Text(
            stringResource(R.string.playtime_last_login, it),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

internal fun formatPlaytime(totalSeconds: Long): String {
    if (totalSeconds <= 0L) return "0m"
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    return when {
        hours > 0 -> "${hours}h ${minutes}m"
        else -> "${minutes}m"
    }
}
