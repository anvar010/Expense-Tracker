package com.spendly.companion

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import java.text.DateFormat
import java.util.Date
import kotlin.concurrent.thread

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { Surface(Modifier.fillMaxSize()) { Screen() } } }
    }

    private fun has(permission: String) = checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    /** Reads this month's inbox once, keeps only bank transaction messages, queues them and starts sending. */
    private fun syncThisMonth(settings: Settings, queue: Queue, onDone: () -> Unit) {
        settings.status = "Reading this month's messages…"
        onDone()
        thread {
            val found = runCatching { SmsReader.readThisMonth(this) }
            val msg = found.fold(
                onSuccess = { items ->
                    val added = queue.addAll(items)
                    if (items.isEmpty()) "No bank transaction messages found this month."
                    else { SyncWorker.enqueue(this); "Found ${items.size} bank message${if (items.size == 1) "" else "s"} this month ($added new). Sending…" }
                },
                onFailure = { "Couldn't read messages: ${it.message ?: "permission denied"}" },
            )
            settings.status = msg
            runOnUiThread(onDone)
        }
    }

    @Composable
    private fun Screen() {
        val settings = remember { Settings(this) }
        val queue = remember { Queue(this) }
        var tick by remember { mutableStateOf(0) } // bumped after each change so the screen re-reads settings
        @Suppress("UNUSED_VARIABLE") val refresh = tick
        var url by remember { mutableStateOf("") }
        var key by remember { mutableStateOf("") }
        var error by remember { mutableStateOf("") }
        // Android 13+ silently refuses SMS permission for apps installed from a file until "Allow restricted settings" is on,
        // so a denial needs an explanation and a shortcut to the right screen, not just a status line.
        var blocked by remember { mutableStateOf(false) }
        val receivePerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (!granted) blocked = true; tick++ }
        val readPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) { blocked = false; syncThisMonth(settings, queue) { tick++ } } else { blocked = true; settings.status = "Permission to read messages was not given, so nothing was synced."; tick++ }
        }
        // Keep "waiting to sync" and the status line fresh while a send is in progress.
        LaunchedEffect(Unit) { while (true) { delay(1500); tick++ } }

        Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Spendly Companion", style = MaterialTheme.typography.headlineSmall)

            // 1. Explain before asking.
            if (!settings.consented) {
                Text("What this app does", style = MaterialTheme.typography.titleMedium)
                Text("It sends your bank transaction messages to your Spendly account. Each message is checked on this phone first: anything that isn't a bank transaction, and anything containing an OTP or security code, is discarded and never stored or sent.")
                Text("New messages are picked up as they arrive. You can also tap \"Sync this month's messages\" to read this month's inbox once. You can pause or disconnect at any time.")
                Button(onClick = { settings.consented = true; tick++ }) { Text("I understand, continue") }
                return@Column
            }

            // 2. Connect with a device key created in the web app (Devices page).
            if (!settings.connected) {
                OutlinedTextField(url, { url = it }, label = { Text("Server URL (https://…/api/ingest)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                OutlinedTextField(key, { key = it }, label = { Text("Device key") }, modifier = Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation())
                if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
                Button(onClick = {
                    if (!url.startsWith("https://") || !key.startsWith("etd_")) error = "Use an https:// URL and a key starting with etd_"
                    else { settings.serverUrl = url.trim(); settings.token = key.trim(); error = ""; tick++ }
                }) { Text("Connect") }
                return@Column
            }

            // 3. Sync this month. The permission is requested only when you tap this.
            Text("Sync messages", style = MaterialTheme.typography.titleMedium)
            Text("Reads this month's messages once, keeps only bank transactions, and sends them to your account. Nothing else leaves your phone. Messages already synced are not added twice.")
            Button(modifier = Modifier.fillMaxWidth(), onClick = {
                if (has(Manifest.permission.READ_SMS)) syncThisMonth(settings, queue) { tick++ } else readPerm.launch(Manifest.permission.READ_SMS)
            }) { Text("Sync this month's messages") }
            if (settings.status.isNotEmpty()) Text(settings.status, color = MaterialTheme.colorScheme.primary)
            if (blocked) {
                Text("Android didn't allow SMS access", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error)
                Text("This is common for apps installed from a file: Android hides the permission pop-up and refuses automatically. To fix it:\n" +
                    "1. Tap \"Open app settings\" below.\n" +
                    "2. Tap the three dots (top right) and choose \"Allow restricted settings\". If you don't see it, skip this step.\n" +
                    "3. Tap Permissions, then SMS, then Allow.\n" +
                    "4. Come back here and tap Sync again.")
                Button(onClick = { startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) }) { Text("Open app settings") }
            }

            // 4. Live detection of new messages.
            if (!has(Manifest.permission.RECEIVE_SMS)) {
                Text("To also catch new messages as they arrive, allow SMS detection.")
                OutlinedButton(onClick = { receivePerm.launch(Manifest.permission.RECEIVE_SMS) }) { Text("Allow live detection") }
            }

            // 5. Status and controls.
            Text("Live detection: " + if (settings.paused) "Paused" else if (has(Manifest.permission.RECEIVE_SMS)) "On" else "Needs permission")
            Text("Waiting to send: ${queue.size()}")
            Text("Sent in total: ${settings.sentTotal}")
            Text("Last sync: " + if (settings.lastSync == 0L) "never" else DateFormat.getDateTimeInstance().format(Date(settings.lastSync)))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Switch(settings.paused, { settings.paused = it; tick++ })
                Text("Pause live detection")
            }
            OutlinedButton(onClick = { SyncWorker.enqueue(this@MainActivity); settings.status = "Trying to send now…"; tick++ }) { Text("Send waiting messages now") }
            OutlinedButton(onClick = { settings.disconnect(this@MainActivity); tick++ }) { Text("Disconnect and delete queued messages") }
        }
    }
}
