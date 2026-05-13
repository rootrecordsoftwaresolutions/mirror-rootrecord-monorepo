package com.rootrecord.kilauea.alerts.ui.more

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rootrecord.kilauea.alerts.data.local.KilaueaPreferences
import com.rootrecord.kilauea.alerts.data.repository.DeveloperMessage
import com.rootrecord.kilauea.alerts.data.repository.DeveloperMessagesRepository
import com.rootrecord.kilauea.alerts.data.repository.RootRecordAuthRepository
import com.rootrecord.kilauea.alerts.work.WorkEnqueue
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MoreViewModel @Inject constructor(
    private val prefs: KilaueaPreferences,
    private val authRepo: RootRecordAuthRepository,
    private val devMessages: DeveloperMessagesRepository,
    @param:ApplicationContext private val appContext: Context,
) : ViewModel() {

    val notifyVolcano = prefs.notificationVolcano.stateIn(viewModelScope, SharingStarted.Eagerly, true)
    val notifyNws = prefs.notificationNws.stateIn(viewModelScope, SharingStarted.Eagerly, true)
    val notifyEq = prefs.notificationEq.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val notifyLive = prefs.notificationLiveFeeds.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val eqThreshold = prefs.eqMagnitudeThreshold.stateIn(viewModelScope, SharingStarted.Eagerly, 4f)

    val authSignedIn = prefs.authSignedIn.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val authEmail = prefs.authEmail.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val authProUnlocked = prefs.authProUnlocked.stateIn(viewModelScope, SharingStarted.Eagerly, false)

    private val _loginBusy = MutableStateFlow(false)
    val loginBusy = _loginBusy.asStateFlow()

    private val _loginError = MutableStateFlow<String?>(null)
    val loginError = _loginError.asStateFlow()

    /** Latest team update (or null while loading / on error). Fetched once per VM. */
    private val _latestDevMessage = MutableStateFlow<DeveloperMessage?>(null)
    val latestDevMessage = _latestDevMessage.asStateFlow()

    init {
        viewModelScope.launch {
            devMessages.latest().onSuccess { _latestDevMessage.value = it }
        }
    }

    fun setVolcano(v: Boolean) {
        viewModelScope.launch { prefs.setNotifyVolcano(v) }
    }

    fun setNws(v: Boolean) {
        viewModelScope.launch { prefs.setNotifyNws(v) }
    }

    fun setEq(v: Boolean) {
        viewModelScope.launch { prefs.setNotifyEq(v) }
    }

    fun setLive(v: Boolean) {
        viewModelScope.launch { prefs.setNotifyLiveFeeds(v) }
    }

    fun setThreshold(v: Float) {
        viewModelScope.launch {
            prefs.setEqThreshold(v.coerceIn(1f, 6f))
            WorkEnqueue.enqueueOneShotAlertPoll(appContext)
        }
    }

    fun clearLoginError() {
        _loginError.value = null
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _loginBusy.value = true
            _loginError.value = null
            val r = authRepo.login(email, password)
            _loginBusy.value = false
            r.onFailure { _loginError.value = it.message ?: "Sign-in failed." }
        }
    }

    fun logout() {
        viewModelScope.launch { authRepo.logout() }
    }
}
