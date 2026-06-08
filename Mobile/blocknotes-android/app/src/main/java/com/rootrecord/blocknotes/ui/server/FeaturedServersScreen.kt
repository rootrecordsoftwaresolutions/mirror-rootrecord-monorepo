package com.rootrecord.blocknotes.ui.server

import android.content.Intent
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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
import com.rootrecord.blocknotes.data.repository.FeaturedServerConfig
import com.rootrecord.blocknotes.data.repository.McMMOStats
import com.rootrecord.blocknotes.ui.components.MinecraftCard

@Composable
fun FeaturedServersScreen(
    onAuth: () -> Unit,
    onOpenServer: (String) -> Unit,
    viewModel: FeaturedServersViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.featured_servers_title),
                style = MaterialTheme.typography.headlineSmall,
            )
            OutlinedButton(onClick = { viewModel.refresh() }) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Text(stringResource(R.string.server_refresh))
            }
        }

        Text(
            stringResource(R.string.featured_servers_lead),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (uiState.loading) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            return@Column
        }

        uiState.error?.let {
            Text(it, color = MaterialTheme.colorScheme.error)
        }

        uiState.worldAddedMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.primary)
        }

        if (!uiState.signedIn) {
            MinecraftCard(modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.server_sign_in_title), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.featured_servers_sign_in_lead))
                OutlinedButton(onClick = onAuth, modifier = Modifier.padding(top = 8.dp)) {
                    Text(stringResource(R.string.sign_in))
                }
            }
        }

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.weight(1f, fill = false),
        ) {
            items(uiState.servers, key = { it.serverId }) { server ->
                FeaturedServerListCard(
                    server = server,
                    showMcmmoPreview = uiState.signedIn,
                    onClick = { onOpenServer(server.serverId) },
                )
            }
        }

        OutlinedButton(
            onClick = {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, "https://rootrecord.info/realm/".toUri()),
                )
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.server_open_realm_web))
        }
    }
}

@Composable
private fun FeaturedServerListCard(
    server: FeaturedServerConfig,
    showMcmmoPreview: Boolean,
    onClick: () -> Unit,
) {
    MinecraftCard(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Text(server.name, style = MaterialTheme.typography.titleMedium)
        if (server.featured) {
            Text(
                stringResource(R.string.featured_servers_featured_badge),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Text(stringResource(R.string.server_address_label, server.address))
        ServerStatusRow(server)
        if (showMcmmoPreview) {
            McMMOSummary(server.mcmmo)
        }
    }
}

@Composable
fun ServerStatusRow(server: FeaturedServerConfig) {
    when {
        server.blocknotesPluginInstalled && server.rootstatActive -> {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text(
                    stringResource(R.string.featured_servers_plugins_online),
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
        server.blocknotesPluginInstalled || server.rootstatActive -> {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text(
                    stringResource(R.string.featured_servers_partial_online),
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
        else -> {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CloudOff, contentDescription = null)
                Text(
                    stringResource(R.string.server_plugin_offline),
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}

@Composable
fun McMMOSummary(mcmmo: McMMOStats?, modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(top = 8.dp)) {
        if (mcmmo == null) {
            Text(
                stringResource(R.string.mcmmo_none_on_server),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text(
                stringResource(R.string.mcmmo_power_level, mcmmo.powerLevel),
                style = MaterialTheme.typography.bodyMedium,
            )
            val topSkills = mcmmo.skills.entries
                .sortedByDescending { it.value }
                .take(3)
                .joinToString(" · ") { "${formatSkillName(it.key)} ${it.value}" }
            if (topSkills.isNotBlank()) {
                Text(
                    topSkills,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

internal fun formatSkillName(key: String): String =
    key.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
