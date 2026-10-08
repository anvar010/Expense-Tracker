package com.spendly.companion

import android.Manifest
import android.content.pm.PackageManager
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import java.text.DateFormat
import java.util.Date

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { Surface(Modifier.fillMaxSize()) { Screen() } } }
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
        val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { tick++ }
        val hasPerm = checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED

        Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Spendly Companion", style = MaterialTheme.typography.headlineSmall)

            // 1. Explain before asking.
            if (!settings.consented) {
                Text("What this app does", style = MaterialTheme.typography.titleMedium)
                Text("It watches for new SMS messages from your bank and sends only transaction messages to your Spendly account. " +
                    "It checks each message on this phone first: anything that isn't a bank transaction, and anything containing an OTP or security code, is discarded and never stored or sent. " +
                    "It cannot read your existing messages. You can pause or disconnect at any time.")
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

            // 3. Permission, requested only after the explanation above.
            if (!hasPerm) {
                Text("SMS permission is needed so the app can be notified when a bank message arrives. Android will ask next.")
                Button(onClick = { permLauncher.launch(Manifest.permission.RECEIVE_SMS) }) { Text("Allow SMS detection") }
            }

            // 4. Status and controls.
            Text("Status: " + if (settings.paused) "Paused" else if (hasPerm) "Watching for bank messages" else "Permission needed")
            Text("Waiting to sync: ${queue.size()}")
            Text("Last sync: " + if (settings.lastSync == 0L) "never" else DateFormat.getDateTimeInstance().format(Date(settings.lastSync)))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Switch(settings.paused, { settings.paused = it; tick++ })
                Text("Pause automatic detection")
            }
            Button(onClick = { SyncWorker.enqueue(this@MainActivity); tick++ }) { Text("Sync now") }
            OutlinedButton(onClick = { settings.disconnect(this@MainActivity); tick++ }) { Text("Disconnect and delete queued messages") }
        }
    }
}
