package com.rootrecord.rootmc.ui.more

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.rootmc.BuildConfig
import com.rootrecord.rootmc.data.local.RootMcPreferences
import com.rootrecord.rootmc.data.repository.ExportRepository
import com.rootrecord.rootmc.data.repository.MinecraftProfileRepository
import com.rootrecord.rootmc.data.repository.RootRecordAuthRepository
import com.rootrecord.rootmc.fcm.RootMcPushRegistrar
import com.rootrecord.rootmc.domain.model.MembershipTier
import com.rootrecord.rootmc.domain.model.MinecraftProfile
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
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MoreUiState(
    val themeMode: String = RootMcPreferences.THEME_SYSTEM,
    val analyticsOptIn: Boolean = false,
    val signedIn: Boolean = false,
    val email: String? = null,
    val accountId: String? = null,
    val guestId: String = "",
    val membershipTier: MembershipTier = MembershipTier.Guest,
    val membershipLabel: String = MembershipTier.Guest.label(),
    val adsRemoved: Boolean = false,
    val versionName: String = BuildConfig.VERSION_NAME,
    val minecraftProfile: MinecraftProfile? = null,
    val cloudSyncUpdatedAt: Long = 0L,
    val cloudSyncError: String? = null,
)

@HiltViewModel
class MoreViewModel @Inject constructor(
    private val prefs: RootMcPreferences,
    private val exportRepository: ExportRepository,
    private val authRepository: RootRecordAuthRepository,
    private val minecraftProfileRepository: MinecraftProfileRepository,
    private val accountSyncScheduler: AccountSyncScheduler,
    private val syncAccountData: SyncAccountDataUseCase,
    private val pushRegistrar: RootMcPushRegistrar,
) : ViewModel() {

    val uiState: StateFlow<MoreUiState> = combine(
        combine(
            prefs.themeMode,
            prefs.analyticsOptIn,
            prefs.authSignedIn,
            prefs.authEmail,
            prefs.authAccountId,
        ) { theme, analytics, signedIn, email, accountId ->
            arrayOf(theme, analytics, signedIn, email, accountId)
        },
        combine(
            prefs.guestId,
            prefs.membershipTier,
            prefs.authProUnlocked,
            prefs.minecraftProfile,
        ) { guestId, tier, adsRemoved, minecraftProfile ->
            arrayOf(guestId, tier, adsRemoved, minecraftProfile)
        },
        combine(
            prefs.cloudSyncUpdatedAt,
            prefs.cloudSyncError,
        ) { cloudSyncUpdatedAt, cloudSyncError ->
            arrayOf(cloudSyncUpdatedAt, cloudSyncError)
        },
    ) { accountBits, membershipBits, syncBits ->
        val theme = accountBits[0] as String
        val analytics = accountBits[1] as Boolean
        val signedIn = accountBits[2] as Boolean
        val email = accountBits[3] as String?
        val accountId = accountBits[4] as String?
        val guestId = membershipBits[0] as String
        val tier = membershipBits[1] as MembershipTier
        val adsRemoved = membershipBits[2] as Boolean
        val minecraftProfile = membershipBits[3] as MinecraftProfile?
        val cloudSyncUpdatedAt = syncBits[0] as Long
        val cloudSyncError = syncBits[1] as String?
        MoreUiState(
            themeMode = theme,
            analyticsOptIn = analytics,
            signedIn = signedIn,
            email = email,
            accountId = accountId,
            guestId = guestId,
            membershipTier = tier,
            membershipLabel = tier.label(),
            adsRemoved = adsRemoved,
            minecraftProfile = minecraftProfile,
            cloudSyncUpdatedAt = cloudSyncUpdatedAt,
            cloudSyncError = cloudSyncError,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MoreUiState())

    private val _loginBusy = MutableStateFlow(false)
    val loginBusy: StateFlow<Boolean> = _loginBusy.asStateFlow()

    private val _loginError = MutableStateFlow<String?>(null)
    val loginError: StateFlow<String?> = _loginError.asStateFlow()

    private val _minecraftLookupBusy = MutableStateFlow(false)
    val minecraftLookupBusy: StateFlow<Boolean> = _minecraftLookupBusy.asStateFlow()

    private val _minecraftLookupError = MutableStateFlow<String?>(null)
    val minecraftLookupError: StateFlow<String?> = _minecraftLookupError.asStateFlow()

    init {
        viewModelScope.launch { prefs.ensureGuestId() }
    }

    fun cycleTheme(current: String) {
        viewModelScope.launch {
            val next = when (current) {
                RootMcPreferences.THEME_LIGHT -> RootMcPreferences.THEME_DARK
                RootMcPreferences.THEME_DARK -> RootMcPreferences.THEME_SYSTEM
                else -> RootMcPreferences.THEME_LIGHT
            }
            prefs.setThemeMode(next)
        }
    }

    fun setAnalyticsOptIn(enabled: Boolean) {
        viewModelScope.launch { prefs.setAnalyticsOptIn(enabled) }
    }

    fun exportJson(onReady: (String) -> Unit) {
        viewModelScope.launch {
            runCatching { exportRepository.exportJson() }.onSuccess(onReady)
        }
    }

    fun exportMarkdown(onReady: (String) -> Unit) {
        viewModelScope.launch {
            runCatching { exportRepository.exportMarkdown() }.onSuccess(onReady)
        }
    }

    fun clearLoginError() {
        _loginError.value = null
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _loginBusy.value = true
            _loginError.value = null
            val result = authRepository.login(email, password)
            _loginBusy.value = false
            result.onSuccess {
                authRepository.refreshAccountAccess()
                accountSyncScheduler.requestSync()
                pushRegistrar.registerCurrentTokenAsync()
            }
            result.onFailure { _loginError.value = it.message ?: "Sign-in failed." }
        }
    }

    fun createAccount(email: String, password: String) {
        viewModelScope.launch {
            _loginBusy.value = true
            _loginError.value = null
            val result = authRepository.createAccount(email, password)
            _loginBusy.value = false
            result.onSuccess {
                authRepository.refreshAccountAccess()
                accountSyncScheduler.requestSync()
                pushRegistrar.registerCurrentTokenAsync()
            }
            result.onFailure { _loginError.value = it.message ?: "Account creation failed." }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            syncAccountData.syncIfSignedIn()
            authRepository.logout()
        }
    }

    fun syncNow() {
        viewModelScope.launch { syncAccountData.syncIfSignedIn() }
    }

    fun clearMinecraftLookupError() {
        _minecraftLookupError.value = null
    }

    fun lookupMinecraftProfile(input: String) {
        viewModelScope.launch {
            _minecraftLookupBusy.value = true
            _minecraftLookupError.value = null
            val result = minecraftProfileRepository.lookupAndSave(input)
            _minecraftLookupBusy.value = false
            result.onFailure { _minecraftLookupError.value = it.message ?: "Lookup failed." }
        }
    }

    fun clearMinecraftProfile() {
        viewModelScope.launch {
            _minecraftLookupError.value = null
            minecraftProfileRepository.clearProfile()
        }
    }
}

const val DISCORD_SUPPORT_URL = "https://discord.gg/rFFQYrNaqS"
