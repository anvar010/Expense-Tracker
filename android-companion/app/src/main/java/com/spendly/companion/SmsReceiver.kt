package com.spendly.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import java.time.Instant
import java.util.UUID

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val settings = Settings(context)
        // Respect consent, the pause switch and the connection state before looking at the message at all.
        if (!settings.consented || settings.paused || !settings.connected) return

        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val body = parts.joinToString("") { it.messageBody ?: "" }
        if (!FinancialFilter.looksFinancial(body)) return // unrelated personal messages are dropped here

        Queue(context).add(Pending(UUID.randomUUID().toString(), body, Instant.now().toString()))
        SyncWorker.enqueue(context)
    }
}
