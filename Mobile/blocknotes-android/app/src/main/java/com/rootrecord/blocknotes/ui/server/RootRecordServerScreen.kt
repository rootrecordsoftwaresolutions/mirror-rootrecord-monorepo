package com.rootrecord.blocknotes.ui.server

import android.content.Intent
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
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
import com.rootrecord.blocknotes.ui.components.MinecraftCard

@Composable
fun RootRecordServerScreen(
    onAuth: () -> Unit,
    onOpenWorlds: () -> Unit,
    onOpenRealm: () -> Unit,
    viewModel: RootRecordServerViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.nav_server), style = MaterialTheme.typography.headlineSmall)
            OutlinedButton(onClick = { viewModel.refresh() }) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Text(stringResource(R.string.server_refresh))
            }
        }

        Text(
            stringResource(R.string.server_lead),
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

        uiState.config?.let { config ->
            MinecraftCard(modifier = Modifier.fillMaxWidth()) {
                Text(config.name, style = MaterialTheme.typography.titleLarge)
                Text(stringResource(R.string.server_address_label, config.address))
                Text(stringResource(R.string.server_world_label, config.defaultWorldName))
                Text(stringResource(R.string.server_version_label, config.gameVersion))
                if (config.blocknotesPluginInstalled) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Text(
                            stringResource(R.string.server_plugin_online),
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                } else {
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

        uiState.worldAddedMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.primary)
        }

        if (!uiState.signedIn) {
            MinecraftCard(modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.server_sign_in_title), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.server_sign_in_lead))
                Button(onClick = onAuth, modifier = Modifier.padding(top = 8.dp)) {
                    Text(stringResource(R.string.sign_in))
                }
            }
        } else {
            val membership = uiState.membership
            val belongsToServer = membership?.servers?.any { it.belongsToServer } == true
            MinecraftCard(modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.server_rootstat_title), style = MaterialTheme.typography.titleMedium)
                when {
                    belongsToServer -> {
                        Text(
                            stringResource(
                                R.string.server_linked_player,
                                membership.minecraftUsername ?: "player",
                            ),
                        )
                        Text(stringResource(R.string.server_member_active))
                    }
                    membership?.rootstatLinked == true -> {
                        Text(
                            stringResource(
                                R.string.server_linked_waiting_plugin,
                                membership.minecraftUsername ?: "player",
                            ),
                        )
                    }
                    else -> {
                        Text(stringResource(R.string.server_link_required))
                        Button(
                            onClick = {
                                val url = uiState.config?.verifyUrl ?: "https://rootrecord.info/realm/verify"
                                CustomTabsIntent.Builder().build()
                                    .launchUrl(context, url.toUri())
                            },
                            modifier = Modifier.padding(top = 8.dp),
                        ) {
                            Icon(Icons.Default.Link, contentDescription = null)
                            Text(stringResource(R.string.server_open_verify))
                        }
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onOpenWorlds) {
                    Text(stringResource(R.string.server_open_worlds))
                }
                OutlinedButton(onClick = onOpenRealm) {
                    Text(stringResource(R.string.realm_title))
                }
            }

            OutlinedButton(
                onClick = {
                    val url = uiState.config?.realmUrl ?: "https://rootrecord.info/realm/"
                    context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri()))
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.server_open_realm_web))
            }
        }
    }
}
