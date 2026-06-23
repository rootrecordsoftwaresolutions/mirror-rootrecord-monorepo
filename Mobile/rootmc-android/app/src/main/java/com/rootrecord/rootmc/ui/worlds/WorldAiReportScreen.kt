package com.rootrecord.rootmc.ui.worlds

import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.rootrecord.rootmc.R
import com.rootrecord.rootmc.data.repository.WorldAiReport
import com.rootrecord.rootmc.ui.components.MinecraftCard
import com.rootrecord.rootmc.ui.upsell.ROOTRECORD_BILLING_URL
import com.rootrecord.rootmc.util.EntryTimestampFromApi
import com.rootrecord.rootmc.ui.upsell.UpsellEvents

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorldAiReportScreen(
    onBack: () -> Unit,
    viewModel: WorldAiReportViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.world_ai_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                MinecraftCard(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        uiState.worldName.ifBlank { stringResource(R.string.world_ai_world_fallback) },
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        stringResource(R.string.world_ai_lead),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    if (uiState.quotaLabel.isNotBlank()) {
                        Text(
                            uiState.quotaLabel,
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    Button(
                        onClick = viewModel::generateReport,
                        enabled = !uiState.generating && !uiState.loading,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp),
                    ) {
                        if (uiState.generating) {
                            CircularProgressIndicator(
                                modifier = Modifier.padding(end = 8.dp),
                                strokeWidth = 2.dp,
                            )
                        }
                        Text(
                            if (uiState.generating) {
                                stringResource(R.string.world_ai_generating)
                            } else {
                                stringResource(R.string.world_ai_generate)
                            },
                        )
                    }
                    uiState.error?.let { err ->
                        Text(
                            err,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                }
            }

            uiState.error?.let { err ->
                item {
                    if (err.contains("Upgrade", ignoreCase = true) || err.contains("quota", ignoreCase = true)) {
                        TextButton(onClick = {
                            CustomTabsIntent.Builder().build().launchUrl(context, ROOTRECORD_BILLING_URL.toUri())
                        }) {
                            Text(stringResource(R.string.view_membership))
                        }
                        TextButton(onClick = { UpsellEvents.trigger() }) {
                            Text(stringResource(R.string.membership_benefits_link))
                        }
                    }
                }
            }

            if (uiState.loading && uiState.catalog == null) {
                item { CircularProgressIndicator() }
            }

            val reports = uiState.catalog?.reports.orEmpty()
            if (!uiState.loading && reports.isEmpty()) {
                item {
                    Text(
                        stringResource(R.string.world_ai_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            items(reports, key = { it.id }) { report ->
                WorldAiReportCard(report)
            }

            item {
                Text(
                    stringResource(R.string.world_ai_disclaimer),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 24.dp),
                )
            }
        }
    }
}

@Composable
private fun WorldAiReportCard(report: WorldAiReport) {
    MinecraftCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            report.summaryText.ifBlank { report.worldName },
            style = MaterialTheme.typography.titleMedium,
        )
        EntryTimestampFromApi(
            raw = report.createdAt,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(
            report.reportText,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}
