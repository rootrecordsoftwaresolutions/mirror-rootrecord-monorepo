package com.rootrecord.blocknotes.ui.more

import android.content.Intent
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.rootrecord.blocknotes.BuildConfig
import com.rootrecord.blocknotes.R
import com.rootrecord.blocknotes.domain.model.MembershipTier
import com.rootrecord.blocknotes.ui.components.MinecraftCard
import com.rootrecord.blocknotes.ui.upsell.ROOTRECORD_BILLING_URL
import com.rootrecord.blocknotes.ui.upsell.UpsellEvents

@Composable
fun MoreScreen(
    onFeedback: () -> Unit,
    onAuth: () -> Unit,
    onBuildPlanner: () -> Unit,
    onTimeline: () -> Unit,
    onRealm: () -> Unit,
    viewModel: MoreViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val loginBusy by viewModel.loginBusy.collectAsStateWithLifecycle()
    val loginError by viewModel.loginError.collectAsStateWithLifecycle()
    val minecraftLookupBusy by viewModel.minecraftLookupBusy.collectAsStateWithLifecycle()
    val minecraftLookupError by viewModel.minecraftLookupError.collectAsStateWithLifecycle()
    val context = LocalContext.current

    var createAccountMode by rememberSaveable { mutableStateOf(false) }
    var emailField by rememberSaveable { mutableStateOf("") }
    var passwordField by rememberSaveable { mutableStateOf("") }
    var confirmPasswordField by rememberSaveable { mutableStateOf("") }
    var minecraftLookupField by rememberSaveable { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.nav_more), style = MaterialTheme.typography.headlineSmall)

        MinecraftCard(modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.account_section_title), style = MaterialTheme.typography.titleMedium)
            Text(
                stringResource(R.string.account_local_first),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
            if (uiState.guestId.isNotBlank() && !uiState.signedIn) {
                Text(
                    "Guest id: ${uiState.guestId.take(12)}…",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Text(
                uiState.membershipLabel,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 8.dp),
            )
            when {
                uiState.membershipTier == MembershipTier.Lifetime -> {
                    Text(
                        stringResource(R.string.membership_lifetime_detail),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                uiState.membershipTier == MembershipTier.Pro -> {
                    Text(
                        stringResource(R.string.membership_pro_detail),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                uiState.signedIn -> {
                    Text(
                        stringResource(R.string.membership_free_signed_in),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                else -> {
                    Text(
                        stringResource(R.string.membership_guest_detail),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (uiState.signedIn && uiState.email != null) {
                Text(uiState.email!!, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 8.dp))
                uiState.accountId?.let { id ->
                    Text(
                        "Account: $id",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                uiState.cloudSyncError?.let { err ->
                    Text(
                        stringResource(R.string.account_cloud_sync_error, err),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                } ?: run {
                    val syncLabel = if (uiState.cloudSyncUpdatedAt > 0L) {
                        stringResource(
                            R.string.account_cloud_sync_last,
                            java.text.DateFormat.getDateTimeInstance(
                                java.text.DateFormat.SHORT,
                                java.text.DateFormat.SHORT,
                            ).format(java.util.Date(uiState.cloudSyncUpdatedAt)),
                        )
                    } else {
                        stringResource(R.string.account_cloud_sync_pending)
                    }
                    Text(
                        syncLabel,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
                TextButton(
                    onClick = { viewModel.syncNow() },
                    modifier = Modifier.padding(top = 2.dp),
                ) {
                    Text(stringResource(R.string.account_sync_now))
                }
            }
            if (!uiState.adsRemoved) {
                OutlinedButton(
                    onClick = {
                        CustomTabsIntent.Builder().build().launchUrl(context, ROOTRECORD_BILLING_URL.toUri())
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                ) {
                    Text(stringResource(R.string.view_membership))
                }
            }
            if (uiState.signedIn) {
                OutlinedButton(
                    onClick = { viewModel.signOut() },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.sign_out))
                }
            } else {
                Text(
                    if (createAccountMode) {
                        stringResource(R.string.account_create_lead)
                    } else {
                        stringResource(R.string.account_sign_in_lead)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
                OutlinedTextField(
                    value = emailField,
                    onValueChange = { emailField = it; viewModel.clearLoginError() },
                    label = { Text("Email") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    enabled = !loginBusy,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = passwordField,
                    onValueChange = { passwordField = it; viewModel.clearLoginError() },
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    enabled = !loginBusy,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (createAccountMode) {
                    OutlinedTextField(
                        value = confirmPasswordField,
                        onValueChange = { confirmPasswordField = it; viewModel.clearLoginError() },
                        label = { Text("Confirm password") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        enabled = !loginBusy,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        "Use at least 8 characters.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                loginError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                val canSubmit = emailField.isNotBlank() &&
                    passwordField.isNotBlank() &&
                    (!createAccountMode || (passwordField.length >= 8 && passwordField == confirmPasswordField))
                Button(
                    onClick = {
                        if (createAccountMode) {
                            viewModel.createAccount(emailField, passwordField)
                        } else {
                            viewModel.login(emailField, passwordField)
                        }
                    },
                    enabled = !loginBusy && canSubmit,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        when {
                            loginBusy && createAccountMode -> "Creating account…"
                            loginBusy -> "Signing in…"
                            createAccountMode -> "Create Root Record account"
                            else -> stringResource(R.string.sign_in)
                        },
                    )
                }
                TextButton(onClick = { createAccountMode = !createAccountMode; viewModel.clearLoginError() }) {
                    Text(
                        if (createAccountMode) "Have an account? Sign in" else "Create new account",
                    )
                }
            }
            if (!uiState.adsRemoved) {
                TextButton(onClick = { UpsellEvents.trigger() }) {
                    Text(stringResource(R.string.membership_benefits_link))
                }
            }
        }

        MinecraftCard(modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.minecraft_profile_title), style = MaterialTheme.typography.titleMedium)
            Text(
                stringResource(R.string.minecraft_profile_lead),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
            uiState.minecraftProfile?.let { profile ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AsyncImage(
                        model = profile.avatarUrl(),
                        contentDescription = stringResource(R.string.minecraft_profile_avatar_cd, profile.username),
                        modifier = Modifier.size(72.dp),
                        contentScale = ContentScale.Fit,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(profile.username, style = MaterialTheme.typography.titleMedium)
                        Text(
                            profile.uuid,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            if (profile.skinSlim) {
                                stringResource(R.string.minecraft_profile_model_slim)
                            } else {
                                stringResource(R.string.minecraft_profile_model_classic)
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                profile.skinUrl?.let { skinUrl ->
                    TextButton(onClick = {
                        CustomTabsIntent.Builder().build().launchUrl(context, skinUrl.toUri())
                    }) {
                        Text(stringResource(R.string.minecraft_profile_view_skin))
                    }
                }
                OutlinedButton(
                    onClick = { viewModel.clearMinecraftProfile() },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.minecraft_profile_remove))
                }
            } ?: run {
                OutlinedTextField(
                    value = minecraftLookupField,
                    onValueChange = {
                        minecraftLookupField = it
                        viewModel.clearMinecraftLookupError()
                    },
                    label = { Text(stringResource(R.string.minecraft_profile_lookup_label)) },
                    placeholder = { Text(stringResource(R.string.minecraft_profile_lookup_hint)) },
                    singleLine = true,
                    enabled = !minecraftLookupBusy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                )
                minecraftLookupError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                Button(
                    onClick = { viewModel.lookupMinecraftProfile(minecraftLookupField) },
                    enabled = !minecraftLookupBusy && minecraftLookupField.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        if (minecraftLookupBusy) {
                            stringResource(R.string.minecraft_profile_lookup_busy)
                        } else {
                            stringResource(R.string.minecraft_profile_lookup_action)
                        },
                    )
                }
            }
        }

        MinecraftCard(modifier = Modifier.fillMaxWidth()) {
            Text("Theme: ${uiState.themeMode}", style = MaterialTheme.typography.titleSmall)
            TextButton(onClick = { viewModel.cycleTheme(uiState.themeMode) }) {
                Text("Cycle theme (light / dark / system)")
            }
        }

        MinecraftCard(modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.analytics_opt_in))
            Switch(
                checked = uiState.analyticsOptIn,
                onCheckedChange = viewModel::setAnalyticsOptIn,
            )
        }

        HorizontalDivider()
        Text("Export", style = MaterialTheme.typography.titleMedium)
        TextButton(onClick = {
            viewModel.exportJson { json ->
                shareText(context, "blocknotes-export.json", "application/json", json)
            }
        }) {
            Text("${stringResource(R.string.export_notes)} (JSON)")
        }
        TextButton(onClick = {
            viewModel.exportMarkdown { md ->
                shareText(context, "blocknotes-export.md", "text/markdown", md)
            }
        }) {
            Text("${stringResource(R.string.export_notes)} (Markdown)")
        }

        HorizontalDivider()
        TextButton(onClick = onRealm) { Text(stringResource(R.string.realm_title)) }
        TextButton(onClick = onFeedback) { Text(stringResource(R.string.feedback)) }
        TextButton(onClick = onAuth) { Text(stringResource(R.string.account_full_screen)) }
        TextButton(onClick = {
            CustomTabsIntent.Builder().build().launchUrl(context, DISCORD_SUPPORT_URL.toUri())
        }) {
            Text(stringResource(R.string.discord_support))
        }
        TextButton(onClick = onBuildPlanner) { Text("Build planner") }
        TextButton(onClick = onTimeline) { Text("Project timeline") }

        HorizontalDivider()
        Text(
            "About Block Notes v${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 88.dp),
        )
    }
}

private fun shareText(context: android.content.Context, filename: String, mime: String, content: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = mime
        putExtra(Intent.EXTRA_TEXT, content)
        putExtra(Intent.EXTRA_SUBJECT, filename)
    }
    context.startActivity(Intent.createChooser(intent, context.getString(R.string.export_notes)))
}
