package com.spendly.companion

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val settings = Settings(applicationContext)
        val queue = Queue(applicationContext)
        if (!settings.connected || settings.paused) return Result.success()

        for (item in queue.all()) {
            when (val outcome = send(settings, item)) {
                Outcome.OK, Outcome.DROP -> queue.remove(item.messageId)
                Outcome.REVOKED -> { settings.disconnect(applicationContext); return Result.failure() }
                Outcome.RETRY -> return Result.retry() // network/server problem: keep the queue, back off
            }
        }
        settings.lastSync = System.currentTimeMillis()
        return Result.success()
    }

    private enum class Outcome { OK, DROP, RETRY, REVOKED }

    private fun send(settings: Settings, item: Pending): Outcome {
        val url = settings.serverUrl ?: return Outcome.RETRY
        // Never send financial data over cleartext.
        if (!url.startsWith("https://") && !BuildConfigDebug.allowCleartext) return Outcome.DROP
        return try {
            val c = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"; connectTimeout = 15000; readTimeout = 20000; doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer ${settings.token}")
                setRequestProperty("X-Request-Time", System.currentTimeMillis().toString()) // fresh on every attempt
            }
            c.outputStream.use { it.write(JSONObject().put("messageId", item.messageId).put("text", item.text).put("receivedAt", item.receivedAt).toString().toByteArray()) }
            when (c.responseCode) {
                in 200..299 -> Outcome.OK
                401 -> Outcome.REVOKED
                429, in 500..599 -> Outcome.RETRY
                else -> Outcome.DROP // 400/422: retrying the same payload can't succeed
            }
        } catch (e: java.io.IOException) {
            Outcome.RETRY
        }
    }

    companion object {
        fun enqueue(context: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync", ExistingWorkPolicy.APPEND_OR_REPLACE, req)
        }
    }
}

object BuildConfigDebug { const val allowCleartext = false }
