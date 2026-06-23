package com.rootrecord.rootmc.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.rootmc.data.local.RootMcPreferences
import com.rootrecord.rootmc.data.repository.RootRecordAuthRepository
import com.rootrecord.rootmc.fcm.RootMcPushRegistrar
import com.rootrecord.rootmc.domain.model.MembershipTier
import com.rootrecord.rootmc.domain.model.label
import com.rootrecord.rootmc.domain.usecase.SyncAccountDataUseCase
import com.rootrecord.rootmc.sync.AccountSyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val isSignup: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
    val signedIn: Boolean = false,
    val emailDisplay: String? = null,
    val accountId: String? = null,
    val membershipTier: MembershipTier = MembershipTier.Guest,
    val membershipLabel: String = MembershipTier.Guest.label(),
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: RootRecordAuthRepository,
    private val accountSyncScheduler: AccountSyncScheduler,
    private val syncAccountData: SyncAccountDataUseCase,
    private val pushRegistrar: RootMcPushRegistrar,
    prefs: RootMcPreferences,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    val signedIn: StateFlow<Boolean> = prefs.authSignedIn
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    init {
        viewModelScope.launch {
            combine(
                prefs.authSignedIn,
                prefs.authEmail,
                prefs.authAccountId,
                prefs.membershipTier,
            ) { signedIn, mail, accountId, tier ->
                AuthUiState(
                    emailDisplay = mail,
                    signedIn = signedIn,
                    accountId = accountId,
                    membershipTier = tier,
                    membershipLabel = tier.label(),
                )
            }.collect { session ->
                _uiState.update { it.copy(
                    emailDisplay = session.emailDisplay,
                    signedIn = session.signedIn,
                    accountId = session.accountId,
                    membershipTier = session.membershipTier,
                    membershipLabel = session.membershipLabel,
                ) }
            }
        }
    }

    fun updateEmail(v: String) = _uiState.update { it.copy(email = v, error = null) }
    fun updatePassword(v: String) = _uiState.update { it.copy(password = v, error = null) }
    fun toggleSignup() = _uiState.update { it.copy(isSignup = !it.isSignup, error = null) }

    fun submit() {
        val state = _uiState.value
        if (state.email.isBlank() || state.password.length < 6) {
            _uiState.update { it.copy(error = "Enter email and password (6+ chars).") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            val result = if (state.isSignup) {
                authRepository.createAccount(state.email, state.password)
            } else {
                authRepository.login(state.email, state.password)
            }
            _uiState.update {
                it.copy(
                    loading = false,
                    error = result.exceptionOrNull()?.message,
                    signedIn = result.isSuccess,
                )
            }
            if (result.isSuccess) {
                authRepository.refreshAccountAccess()
                accountSyncScheduler.requestSync()
                pushRegistrar.registerCurrentTokenAsync()
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            syncAccountData.syncIfSignedIn()
            authRepository.logout()
            _uiState.update { AuthUiState() }
        }
    }
}
