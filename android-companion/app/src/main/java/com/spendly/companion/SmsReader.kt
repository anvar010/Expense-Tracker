package com.spendly.companion

import android.content.Context
import android.provider.Telephony
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * One-off, user-triggered read of the inbox for the current month. Only messages that pass
 * [FinancialFilter] leave this function; everything else is discarded without being stored.
 */
object SmsReader {
    const val MAX_MESSAGES = 500

    /** Midnight at the start of this month, local time, in epoch milliseconds. */
    fun startOfMonth(now: ZonedDateTime = ZonedDateTime.now(ZoneId.systemDefault())): Long =
        now.toLocalDate().withDayOfMonth(1).atStartOfDay(now.zone).toInstant().toEpochMilli()

    /** Stable per message, so syncing twice never creates duplicates on the server. */
    fun messageId(smsId: Long) = "sms-$smsId"

    fun toPending(smsId: Long, body: String, dateMillis: Long): Pending? =
        if (FinancialFilter.looksFinancial(body)) Pending(messageId(smsId), body, Instant.ofEpochMilli(dateMillis).toString()) else null

    fun readThisMonth(context: Context): List<Pending> {
        val out = mutableListOf<Pending>()
        context.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            arrayOf(Telephony.Sms._ID, Telephony.Sms.BODY, Telephony.Sms.DATE),
            "${Telephony.Sms.DATE} >= ?", arrayOf(startOfMonth().toString()),
            "${Telephony.Sms.DATE} ASC",
        )?.use { c ->
            val idCol = c.getColumnIndexOrThrow(Telephony.Sms._ID)
            val bodyCol = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val dateCol = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
            while (c.moveToNext() && out.size < MAX_MESSAGES) {
                toPending(c.getLong(idCol), c.getString(bodyCol) ?: "", c.getLong(dateCol))?.let(out::add)
            }
        }
        return out
    }
}
