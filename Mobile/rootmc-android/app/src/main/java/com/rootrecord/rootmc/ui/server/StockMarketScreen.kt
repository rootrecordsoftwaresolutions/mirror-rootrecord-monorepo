package com.rootrecord.rootmc.ui.server

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.rootrecord.rootmc.R
import com.rootrecord.rootmc.ui.components.MinecraftCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockMarketScreen(
    onBack: () -> Unit,
    onOpenVault: () -> Unit,
    onOpenShopAlerts: () -> Unit = {},
    viewModel: StockMarketViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    if (uiState.buyItemKey != null) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissBuyDialog() },
            title = { Text(stringResource(R.string.stock_market_buy_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(uiState.buyItemKey.orEmpty())
                    OutlinedTextField(
                        value = uiState.buyQuantity,
                        onValueChange = viewModel::setBuyQuantity,
                        label = { Text(stringResource(R.string.stock_market_quantity)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    uiState.buyMessage?.let {
                        Text(it, color = MaterialTheme.colorScheme.primary)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = viewModel::confirmBuy,
                    enabled = !uiState.buyInFlight,
                ) {
                    Text(stringResource(R.string.stock_market_buy_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissBuyDialog) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.stock_market_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    IconButton(onClick = onOpenShopAlerts) {
                        Icon(Icons.Default.Notifications, contentDescription = stringResource(R.string.shop_alerts_open))
                    }
                    IconButton(onClick = viewModel::refresh) {
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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(R.string.stock_market_lead),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedButton(onClick = onOpenVault, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.vault_open))
            }

            if (uiState.loading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                return@Column
            }

            uiState.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
            }

            if (uiState.catalog.isEmpty()) {
                Text(stringResource(R.string.stock_market_empty))
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(uiState.catalog, key = { it.itemKey }) { row ->
                        MinecraftCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(formatItemLabel(row.itemKey), style = MaterialTheme.typography.titleSmall)
                                    Text(
                                        stringResource(
                                            R.string.stock_market_row,
                                            formatMoney(row.avgPrice),
                                            row.sampleCount,
                                        ),
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                OutlinedButton(onClick = { viewModel.openBuyDialog(row.itemKey) }) {
                                    Text(stringResource(R.string.stock_market_buy))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VaultScreen(
    onBack: () -> Unit,
    viewModel: VaultViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.vault_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(R.string.vault_lead),
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

            if (uiState.pending.isEmpty()) {
                Text(stringResource(R.string.vault_empty))
            } else {
                uiState.pending.forEach { order ->
                    MinecraftCard(modifier = Modifier.fillMaxWidth()) {
                        Text(formatItemLabel(order.itemKey), style = MaterialTheme.typography.titleSmall)
                        Text(
                            stringResource(
                                R.string.vault_order_row,
                                order.quantity,
                                formatMoney(order.pricePaid),
                            ),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}

private fun formatItemLabel(itemKey: String): String =
    itemKey.lowercase().replace('_', ' ').replaceFirstChar { it.titlecase() }

private fun formatMoney(value: Double): String =
    if (value >= 1000) "%.0f G".format(value) else "%.2f G".format(value)
