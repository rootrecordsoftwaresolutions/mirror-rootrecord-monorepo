package com.rootrecord.kilauea.alerts.fcm

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.rootrecord.kilauea.alerts.work.WorkEnqueue
/**
 * Supplements on-device polling: data payloads trigger a fresh alert diff against official APIs.
 */
class KilaueaFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data.isNotEmpty() || message.notification != null) {
            WorkEnqueue.enqueueOneShotAlertPoll(applicationContext)
        }
    }
}
