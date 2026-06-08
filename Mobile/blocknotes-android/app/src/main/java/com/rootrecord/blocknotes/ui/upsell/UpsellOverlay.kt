package com.rootrecord.blocknotes.ui.upsell

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.rootrecord.blocknotes.R

const val ROOTRECORD_BILLING_URL = "https://rootrecord.info/billing"
const val ROOTRECORD_ACCOUNT_URL = "https://rootrecord.info/billing"

@Composable
fun UpsellOverlay() {
    val show by UpsellEvents.show.collectAsState()
    if (!show) return

    val ctx = LocalContext.current

    AlertDialog(
        onDismissRequest = { UpsellEvents.dismiss() },
        title = { Text("Root Record membership") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    "Block Notes works fully offline as a guest — your worlds and notes stay on this device.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    "Members get ad-free use and shared Root Record perks across our apps:",
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Text("• No banner or interstitial ads", style = MaterialTheme.typography.bodySmall)
                Text("• One account for Weather, Business, Kīlauea, and more", style = MaterialTheme.typography.bodySmall)
                Text("• Cloud backup for worlds, notes, and waypoints", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                UpsellEvents.dismiss()
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(ROOTRECORD_BILLING_URL))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { ctx.startActivity(intent) }
            }) {
                Text(stringResource(R.string.view_membership))
            }
        },
        dismissButton = {
            Column(horizontalAlignment = Alignment.End) {
                TextButton(onClick = { UpsellEvents.navigateToSignIn() }) {
                    Text(stringResource(R.string.upsell_sign_in))
                }
                TextButton(onClick = { UpsellEvents.dismiss() }) {
                    Text(stringResource(R.string.upsell_continue_guest))
                }
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
}
