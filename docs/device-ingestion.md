# Device ingestion (Android and iPhone)

## Endpoint
`POST /api/ingest`

| Header | Value |
|---|---|
| `Authorization` | `Bearer etd_…` per-device key from **Devices** in the web app |
| `X-Request-Time` | current time, milliseconds since epoch. Rejected if more than ±10 minutes from server time |
| `Content-Type` | `application/json` |

Body: `{ "messageId": "<unique id, 8-100 chars>", "text": "<message>", "receivedAt": "<ISO-8601, optional>" }`

Response `data.status`: `created` · `needs_review` · `duplicate` · `ignored` (OTPs and non-transactions; nothing stored).

### Security properties
- Keys are random, stored only as SHA-256 hashes, and revocable. A revoked key gets 401 immediately.
- **Replay protection:** a stale `X-Request-Time` is rejected, and `messageId` is unique per user, so a resend inside the window is a no-op (`duplicate`).
- **Duplicates across channels:** a transaction fingerprint (amount, currency, day, merchant, last 4) stops SMS, email and statement imports from creating the same transaction twice.
- **Rate limit:** 60 requests/minute per key (429 + `retryAfter`). The limiter is in-memory per server instance; use a shared store if you run several instances.
- **Raw message retention:** confident parses keep no message text. Messages needing review are stored AES-256-GCM encrypted (`MESSAGE_ENCRYPTION_KEY`) and wiped when you accept or discard them. Without a valid key the server refuses to store text.
- Messages containing OTP / security-code words are discarded before anything is stored.

## iPhone (Shortcuts)
iOS does not let apps read your SMS inbox. A Shortcuts *Message* automation can fire when a message arrives and call the endpoint. Whether it can run without a tap depends on your iOS version and Shortcuts settings, so test it on your device.

1. Web app → **Devices** → create an iPhone key. Copy the key and URL.
2. Shortcuts → Automation → **New** → **Message** → sender contains your bank's sender name → *Run Immediately* if offered.
3. Add **Get Contents of URL**: URL = server URL, Method = POST, Request Body = JSON:
   - `messageId`: **Random UUID**-style text (e.g. *Current Date* formatted with seconds + a random number)
   - `text`: **Shortcut Input** (the message)
4. Headers: `Authorization: Bearer <key>`; `X-Request-Time`: Current Date → Format *Unix time* × 1000 (use a Calculate step).

Other iPhone options: paste or share a message into **Messages** in the web app, upload a statement, or import bank email alerts.

## Android
Source: `android-companion/` (Kotlin, Compose, WorkManager). It requests **`RECEIVE_SMS` only**, never `READ_SMS`, so it sees messages as they arrive and cannot read history. Each message is filtered on the phone (must look like a transaction, must not contain OTP/security words) before it is queued; the queue retries with backoff and is wiped on **Disconnect**. Consent screen, pause switch and sync status are in the app.

**Not yet built or run:** this project has not been compiled in Android Studio. Open it, let Gradle sync, run `FinancialFilterTest`, then test on a device.

### Google Play eligibility (important)
Google restricts SMS permissions for apps published on Google Play, and automatic bank-SMS parsing for an expense tracker may not qualify for an exception. **Check the current Play Console policy and permission declaration form before planning a Play release.** Do not assume approval. Alternatives:
- Distribute the APK directly (sideloading) for personal or internal use.
- Use a notification-listener approach (user grants Notification access), which has its own policy review, not built here.
- Manual share/paste and statement import, which need no special permission.
