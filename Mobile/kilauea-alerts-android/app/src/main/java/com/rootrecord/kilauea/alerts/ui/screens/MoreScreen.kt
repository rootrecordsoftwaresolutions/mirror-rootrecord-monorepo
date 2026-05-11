package com.rootrecord.kilauea.alerts.ui.screens

import android.Manifest
import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.rootrecord.kilauea.alerts.ui.KilaueaNavRoutes
import com.rootrecord.kilauea.alerts.ui.components.DisclaimerBanner
import com.rootrecord.kilauea.alerts.ui.more.MoreViewModel

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun MoreScreen(
    navController: NavController,
    vm: MoreViewModel = hiltViewModel(),
) {
    val nv by vm.notifyVolcano.collectAsState()
    val nn by vm.notifyNws.collectAsState()
    val ne by vm.notifyEq.collectAsState()
    val nl by vm.notifyLive.collectAsState()
    val th by vm.eqThreshold.collectAsState()

    val signedIn by vm.authSignedIn.collectAsState()
    val authEmail by vm.authEmail.collectAsState()
    val authPro by vm.authProUnlocked.collectAsState()
    val loginBusy by vm.loginBusy.collectAsState()
    val loginError by vm.loginError.collectAsState()

    var emailField by rememberSaveable { mutableStateOf("") }
    var passwordField by rememberSaveable { mutableStateOf("") }
    val uriHandler = LocalUriHandler.current

    LaunchedEffect(signedIn) {
        if (signedIn) passwordField = ""
    }

    val postNotif = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        rememberPermissionState(Manifest.permission.POST_NOTIFICATIONS)
    } else {
        null
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        DisclaimerBanner(compact = false)

        Text("Account (optional)", style = MaterialTheme.typography.titleMedium)
        Text(
            "Sign in is optional in this testing build.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (signedIn && authEmail != null) {
            Text(authEmail!!, style = MaterialTheme.typography.bodyLarge)
            Text(
                if (authPro) {
                    "Pro active on this account."
                } else {
                    "Signed in. Pro / ad-free unlock will apply here once available."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedButton(
                onClick = { vm.logout() },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Sign out")
            }
        } else {
            OutlinedTextField(
                value = emailField,
                onValueChange = { emailField = it; vm.clearLoginError() },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Email") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                enabled = !loginBusy,
            )
            OutlinedTextField(
                value = passwordField,
                onValueChange = { passwordField = it; vm.clearLoginError() },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Password") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                enabled = !loginBusy,
            )
            loginError?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Button(
                onClick = { vm.login(emailField, passwordField) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !loginBusy && emailField.isNotBlank() && passwordField.isNotBlank(),
            ) {
                Text(if (loginBusy) "Signing in…" else "Sign in")
            }
        }

        Spacer(Modifier.height(8.dp))

        Text("Notification categories", style = MaterialTheme.typography.titleMedium)
        if (postNotif != null && !postNotif.status.isGranted) {
            Text(
                "Android 13+ requires notification permission — grant when prompted after enabling alerts.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }
        RowToggle("USGS volcano / Kīlauea", nv) {
            if (postNotif != null && !postNotif.status.isGranted) postNotif.launchPermissionRequest()
            vm.setVolcano(it)
        }
        RowToggle("NWS Hawaiʻi alerts", nn) {
            if (postNotif != null && !postNotif.status.isGranted) postNotif.launchPermissionRequest()
            vm.setNws(it)
        }
        RowToggle("Strong earthquakes (USGS)", ne) {
            if (postNotif != null && !postNotif.status.isGranted) postNotif.launchPermissionRequest()
            vm.setEq(it)
        }
        Text("Earthquake notify magnitude ≥ ${"%.1f".format(th)}", style = MaterialTheme.typography.bodySmall)
        Slider(
            value = th.coerceIn(1f, 6f),
            onValueChange = { vm.setThreshold(it.coerceIn(1f, 6f)) },
            valueRange = 1f..6f,
            steps = 5,
        )
        RowToggle("When the live stream list changes (optional)", nl) {
            vm.setLive(it)
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("About", style = MaterialTheme.typography.titleMedium)
                Text(
                    "This app is in development. Data is sourced from official agencies (USGS, NWS) and may have delays or gaps.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "Built by Root Record Software Solutions.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(
                    onClick = { uriHandler.openUri("https://rootrecord.info/") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Root Record website")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    TextButton(
                        onClick = { uriHandler.openUri("https://rootrecord.info/privacy.html") },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Privacy")
                    }
                    TextButton(
                        onClick = { uriHandler.openUri("https://rootrecord.info/terms.html") },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Terms")
                    }
                }
                Text(
                    "Beta testers: join the Google Group to access other test builds.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(
                    onClick = { uriHandler.openUri("https://groups.google.com/g/rootrecordtesting") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Join Beta Testing group")
                }

                TextButton(
                    onClick = { navController.navigate(KilaueaNavRoutes.Feedback) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Send feedback")
                }

                TextButton(
                    onClick = { navController.navigate("photos") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Volcano photo gallery & uploads")
                }

                if (signedIn && authEmail?.trim()?.lowercase() == "rootrecord@outlook.com") {
                    TextButton(
                        onClick = { uriHandler.openUri("https://rootrecord.info/photos-admin.html") },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Photo approvals (admin)")
                    }
                }
            }
        }
    }
}

@Composable
private fun RowToggle(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
