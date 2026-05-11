package com.rootrecord.kilauea.alerts.notifications

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.rootrecord.kilauea.alerts.MainActivity
import com.rootrecord.kilauea.alerts.R
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class KilaueaNotificationManager @Inject constructor(
    @param:ApplicationContext private val context: Context,
) {

    private val nm get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        listOf(
            Triple(CH_VOLCANO, "Kīlauea — USGS volcano", NotificationManager.IMPORTANCE_HIGH),
            Triple(CH_NWS, "Big Island — NWS alerts", NotificationManager.IMPORTANCE_DEFAULT),
            Triple(CH_EQ, "Hawaiʻi earthquakes", NotificationManager.IMPORTANCE_DEFAULT),
            Triple(CH_LIVE, "Live feeds", NotificationManager.IMPORTANCE_LOW),
        ).forEach { (id, name, imp) ->
            nm.createNotificationChannel(
                android.app.NotificationChannel(id, name, imp),
            )
        }
    }

    fun notifyVolcano(title: String, text: String, notificationId: Int = NOTIF_VOLCANO) {
        notify(CH_VOLCANO, notificationId, title, text)
    }

    fun notifyNws(title: String, text: String, notificationId: Int = NOTIF_NWS) {
        notify(CH_NWS, notificationId, title, text)
    }

    fun notifyEarthquake(title: String, text: String, notificationId: Int = NOTIF_EQ) {
        notify(CH_EQ, notificationId, title, text)
    }

    fun notifyLiveFeed(title: String, text: String) {
        notify(CH_LIVE, NOTIF_LIVE, title, text)
    }

    private fun notify(channel: String, id: Int, title: String, text: String) {
        val pending = PendingIntent.getActivity(
            context,
            id,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(MainActivity.EXTRA_OPEN_TAB, MainActivity.TAB_ALERTS)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        nm.notify(id, n)
    }

    companion object {
        const val CH_VOLCANO = "kilauea_volcano"
        const val CH_NWS = "kilauea_nws"
        const val CH_EQ = "kilauea_eq"
        const val CH_LIVE = "kilauea_live"

        private const val NOTIF_VOLCANO = 1001
        private const val NOTIF_NWS = 1002
        private const val NOTIF_EQ = 1003
        private const val NOTIF_LIVE = 1004
    }
}
