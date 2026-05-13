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
import com.rootrecord.kilauea.alerts.BuildConfig
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
    val latestDev by vm.latestDevMessage.collectAsState()

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

        // Latest team update — rendered immediately above the "Desktop version" card so the
        // signal-to-noise is good (settings/toggles above, outbound links below). Only shows when
        // there's actually a message to display; collapses cleanly otherwise.
        latestDev?.let { msg ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Latest update from the team", style = MaterialTheme.typography.titleMedium)
                    if (msg.createdAt.isNotBlank()) {
                        Text(
                            formatDeveloperMessageWhen(msg.createdAt),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(msg.body, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Desktop version", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Pro members can open the full Kīlauea Alerts dashboard in any desktop or laptop browser at kilauea.rootrecord.info.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = { uriHandler.openUri("https://kilauea.rootrecord.info/") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Open kilauea.rootrecord.info")
                }
            }
        }

        // ---- About & Help ---------------------------------------------------------------
        // Layout mirrors Business Manager's About page
        // (`Web/apps/business-manager-web/src/components/modules/Settings.jsx`) so the five
        // RootRecord products read the same way; copy here is Kilauea-Alerts-specific.
        //
        // Version comes from `BuildConfig.VERSION_NAME` (sourced from `app/build.gradle.kts`
        // `defaultConfig.versionName`). This is what the release builder
        // (`Mobile/kilauea-alerts-android/bump-and-build-release.bat`) reads when naming the
        // APK/AAB artifacts, so any version bump in build.gradle.kts flows into both the
        // outputs and this screen automatically — never hard-code a version here.
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("About & Help", style = MaterialTheme.typography.titleMedium)

                Text(
                    "RootRecord Kīlauea Alerts",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    "Mobile build · v${BuildConfig.VERSION_NAME}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "USGS volcano notices, NWS Hawaiʻi alerts, AccuWeather forecasts, and earthquake feeds — focused on Hawaiʻi Island.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Text(
                    "What RootRecord stands for",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    "• Reliability first\n• Clarity over cleverness\n• Operability in the real world\n• Composable services\n• Respectful communication",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Text("Plans", style = MaterialTheme.typography.titleSmall)
                Text(
                    "Pro unlocks every Big Island location, push alerts, and the full Kīlauea dashboard at kilauea.rootrecord.info. Free keeps the Volcano-only view with live USGS, NWS, and HVO data.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Text("Custom app development", style = MaterialTheme.typography.titleSmall)
                Text(
                    "Need something built for your workflow, team, or customers? Tell us purpose, platforms, scope, and timeline.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(
                    onClick = { uriHandler.openUri("https://rootrecord.info/app-build-request") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("rootrecord.info/app-build-request")
                }

                Text("Where to get help", style = MaterialTheme.typography.titleSmall)
                Text(
                    "Use Send feedback below for bug reports, ideas, or subscription questions. Visit rootrecord.info for the latest.",
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

/** Render a developer-message ISO timestamp as a short local date/time, falling back to raw. */
private fun formatDeveloperMessageWhen(iso: String): String {
    return runCatching {
        val instant = java.time.Instant.parse(iso)
        val zoned = instant.atZone(java.time.ZoneId.systemDefault())
        zoned.format(java.time.format.DateTimeFormatter.ofPattern("MMM d, h:mm a"))
    }.getOrElse { iso }
}
