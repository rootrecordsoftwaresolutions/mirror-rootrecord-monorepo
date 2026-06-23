package com.rootrecord.rootmc.ui.server

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.rootmc.data.repository.ServerRepository
import com.rootrecord.rootmc.data.repository.StockMarketRow
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class StockMarketUiState(
    val loading: Boolean = true,
    val serverId: String = "rootmc",
    val catalog: List<StockMarketRow> = emptyList(),
    val totalItems: Int = 0,
    val error: String? = null,
    val buyItemKey: String? = null,
    val buyQuantity: String = "1",
    val buyInFlight: Boolean = false,
    val buyMessage: String? = null,
)

@HiltViewModel
class StockMarketViewModel @Inject constructor(
    private val serverRepository: ServerRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(StockMarketUiState())
    val uiState: StateFlow<StockMarketUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            val config = serverRepository.fetchFeaturedServerConfig().getOrNull()
            val serverId = config?.serverId ?: "rootmc"
            val catalog = serverRepository.fetchStockMarket(serverId).getOrElse { emptyList() }
            _uiState.update {
                it.copy(
                    loading = false,
                    serverId = serverId,
                    catalog = catalog,
                    error = if (catalog.isEmpty()) null else null,
                )
            }
        }
    }

    fun openBuyDialog(itemKey: String) {
        _uiState.update { it.copy(buyItemKey = itemKey, buyQuantity = "1", buyMessage = null) }
    }

    fun dismissBuyDialog() {
        _uiState.update { it.copy(buyItemKey = null, buyInFlight = false, buyMessage = null) }
    }

    fun setBuyQuantity(value: String) {
        _uiState.update { it.copy(buyQuantity = value.filter { ch -> ch.isDigit() }.take(4)) }
    }

    fun confirmBuy() {
        val state = _uiState.value
        val itemKey = state.buyItemKey ?: return
        val qty = state.buyQuantity.toIntOrNull()?.coerceIn(1, 576) ?: 1
        viewModelScope.launch {
            _uiState.update { it.copy(buyInFlight = true, buyMessage = null) }
            serverRepository.buyFromApp(state.serverId, itemKey, qty)
                .onSuccess { result ->
                    _uiState.update {
                        it.copy(
                            buyInFlight = false,
                            buyMessage = result.message ?: "Queued — claim with /vault in-game.",
                        )
                    }
                }
                .onFailure { err ->
                    _uiState.update {
                        it.copy(buyInFlight = false, buyMessage = err.message ?: "Purchase failed.")
                    }
                }
        }
    }
}
