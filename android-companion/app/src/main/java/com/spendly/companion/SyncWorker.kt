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
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/** Sends queued messages to the server in batches of up to 50, and keeps whatever the server could not process. */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val settings = Settings(applicationContext)
        val queue = Queue(applicationContext)
        if (!settings.connected || settings.paused) return Result.success()

        var sent = 0
        for (batch in queue.all().chunked(BATCH)) {
            when (val r = send(settings, batch)) {
                is Outcome.Done -> {
                    batch.forEachIndexed { i, p -> if (r.ok.getOrElse(i) { true }) { queue.remove(p.messageId); sent++ } }
                    if (r.ok.any { !it }) { settings.status = "Sent $sent. Some messages will be retried."; return Result.retry() }
                }
                Outcome.Drop -> batch.forEach { queue.remove(it.messageId) }
                Outcome.Revoked -> { settings.disconnect(applicationContext); settings.status = "This device key was revoked. Create a new key in the web app and reconnect."; return Result.failure() }
                is Outcome.Retry -> { settings.status = r.reason; return Result.retry() }
            }
        }
        settings.sentTotal += sent
        settings.lastSync = System.currentTimeMillis()
        settings.status = if (sent == 0) "Nothing to send." else "Sent $sent bank message${if (sent == 1) "" else "s"} to your account."
        return Result.success()
    }

    private sealed class Outcome {
        class Done(val ok: List<Boolean>) : Outcome()
        object Drop : Outcome()
        object Revoked : Outcome()
        class Retry(val reason: String) : Outcome()
    }

    private fun send(settings: Settings, batch: List<Pending>): Outcome {
        val base = (settings.serverUrl ?: return Outcome.Retry("Not connected.")).trimEnd('/')
        // Never send financial data over cleartext.
        if (!base.startsWith("https://")) return Outcome.Drop
        return try {
            val c = (URL("$base/batch").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"; connectTimeout = 15000; readTimeout = 60000; doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer ${settings.token}")
                setRequestProperty("X-Request-Time", System.currentTimeMillis().toString()) // fresh on every attempt
            }
            val body = JSONObject().put("messages", JSONArray(batch.map {
                JSONObject().put("messageId", it.messageId).put("text", it.text).put("receivedAt", it.receivedAt)
            }))
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            when (val code = c.responseCode) {
                in 200..299 -> {
                    val results = JSONObject(c.inputStream.bufferedReader().readText()).getJSONObject("data").getJSONArray("results")
                    Outcome.Done((0 until results.length()).map { results.getJSONObject(it).optString("status") != "error" })
                }
                401 -> Outcome.Revoked
                429 -> Outcome.Retry("The server asked us to slow down. Retrying shortly.")
                in 500..599 -> Outcome.Retry("The server had a problem (HTTP $code). Retrying shortly.")
                else -> Outcome.Drop // 400/422: resending the same payload can't succeed
            }
        } catch (e: java.io.IOException) {
            Outcome.Retry("Can't reach the server. Will retry when you're online.")
        }
    }

    companion object {
        private const val BATCH = 50

        fun enqueue(context: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync", ExistingWorkPolicy.APPEND_OR_REPLACE, req)
        }
    }
}
