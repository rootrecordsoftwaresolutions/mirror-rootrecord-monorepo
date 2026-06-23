package com.rootrecord.rootmc.ui.auth

import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.rootrecord.rootmc.R
import com.rootrecord.rootmc.domain.model.MembershipTier
import com.rootrecord.rootmc.ui.upsell.ROOTRECORD_BILLING_URL

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthScreen(
    onBack: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.sign_in)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
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
                stringResource(R.string.account_local_first),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                uiState.membershipLabel,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            if (uiState.signedIn) {
                Text("Signed in as ${uiState.emailDisplay}")
                uiState.accountId?.let {
                    Text("Account: $it", style = MaterialTheme.typography.bodySmall)
                }
                if (uiState.membershipTier == MembershipTier.SignedInFree) {
                    OutlinedButton(
                        onClick = {
                            CustomTabsIntent.Builder().build().launchUrl(context, ROOTRECORD_BILLING_URL.toUri())
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.view_membership))
                    }
                }
                TextButton(onClick = { viewModel.logout(); onBack() }) {
                    Text(stringResource(R.string.sign_out))
                }
            } else {
                OutlinedTextField(
                    value = uiState.email,
                    onValueChange = viewModel::updateEmail,
                    label = { Text("Email") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = uiState.password,
                    onValueChange = viewModel::updatePassword,
                    label = { Text("Password") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                uiState.error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error)
                }
                Button(
                    onClick = { viewModel.submit() },
                    enabled = !uiState.loading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        if (uiState.loading) "…" else if (uiState.isSignup) {
                            "Create account"
                        } else {
                            stringResource(R.string.sign_in)
                        },
                    )
                }
                TextButton(onClick = { viewModel.toggleSignup() }) {
                    Text(if (uiState.isSignup) "Have an account? Sign in" else "Create new account")
                }
                OutlinedButton(
                    onClick = {
                        CustomTabsIntent.Builder().build().launchUrl(context, ROOTRECORD_BILLING_URL.toUri())
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.view_membership))
                }
            }
        }
    }
}
