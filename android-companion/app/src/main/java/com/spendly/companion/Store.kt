package com.spendly.companion

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject

/** Connection settings. The device key lives in EncryptedSharedPreferences (Android Keystore backed). */
class Settings(context: Context) {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context, "spendly_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    var token: String? get() = prefs.getString("token", null); set(v) = prefs.edit().putString("token", v).apply()
    var serverUrl: String? get() = prefs.getString("url", null); set(v) = prefs.edit().putString("url", v).apply()
    var paused: Boolean get() = prefs.getBoolean("paused", false); set(v) = prefs.edit().putBoolean("paused", v).apply()
    var consented: Boolean get() = prefs.getBoolean("consented", false); set(v) = prefs.edit().putBoolean("consented", v).apply()
    var lastSync: Long get() = prefs.getLong("lastSync", 0); set(v) = prefs.edit().putLong("lastSync", v).apply()
    /** Plain-language result of the last sync or send, shown on the main screen. */
    var status: String get() = prefs.getString("status", "") ?: ""; set(v) = prefs.edit().putString("status", v).apply()
    var sentTotal: Int get() = prefs.getInt("sentTotal", 0); set(v) = prefs.edit().putInt("sentTotal", v).apply()
    val connected: Boolean get() = !token.isNullOrBlank() && !serverUrl.isNullOrBlank()

    /** Disconnecting removes the key, the URL and everything still waiting to be sent. */
    fun disconnect(context: Context) {
        prefs.edit().clear().apply()
        Queue(context).clear()
    }
}

data class Pending(val messageId: String, val text: String, val receivedAt: String)

/** Offline retry queue in app-private storage. Items are deleted once the server confirms them. */
class Queue(context: Context) {
    private val file = java.io.File(context.filesDir, "queue.json")

    @Synchronized fun all(): List<Pending> = runCatching {
        val arr = JSONArray(file.readText())
        (0 until arr.length()).map { arr.getJSONObject(it).let { o -> Pending(o.getString("id"), o.getString("text"), o.getString("at")) } }
    }.getOrDefault(emptyList())

    @Synchronized private fun save(items: List<Pending>) {
        file.writeText(JSONArray(items.map { JSONObject().put("id", it.messageId).put("text", it.text).put("at", it.receivedAt) }).toString())
    }

    @Synchronized fun add(p: Pending) = save((all() + p).takeLast(500))

    /** Adds only messages not already waiting; returns how many were new. */
    @Synchronized fun addAll(items: List<Pending>): Int {
        val have = all().map { it.messageId }.toSet()
        val fresh = items.filter { it.messageId !in have }
        if (fresh.isNotEmpty()) save((all() + fresh).takeLast(500))
        return fresh.size
    }
    @Synchronized fun remove(id: String) = save(all().filterNot { it.messageId == id })
    @Synchronized fun clear() { file.delete() }
    fun size() = all().size
}
