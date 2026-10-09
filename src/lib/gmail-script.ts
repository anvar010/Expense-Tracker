/**
 * Google Apps Script that runs inside the user's own Google account and sends bank/payment emails to Spendly.
 * Shown on the Devices page. Matching is by content, and every email is checked inside Google first:
 * only emails that look like a money transaction are sent, and everything else stays in Gmail.
 */
export const GMAIL_SCRIPT = `// Spendly: send payment, debit and credit emails from this month to your account.
// Runs inside your own Google account. Each email is checked here first, and only emails that look like
// a money transaction are sent. Newsletters, personal mail and anything with a one-time code stay in Gmail.

// 1) Paste your Shortcut URL from the Spendly Devices page (it contains your private key).
const SPENDLY_URL = "PASTE_YOUR_SHORTCUT_URL_HERE";

// 2) Optional: only read mail from these senders (parts of the name or address). Empty means any sender.
const ONLY_FROM = [];

const CURRENCY = "(?:AED|DHS?|USD|INR|EUR|GBP|SAR|QAR|KWD|BHD|OMR|RS\\\\.?)";
const AMOUNT = new RegExp("\\\\b" + CURRENCY + "\\\\s?[\\\\d,]+(?:\\\\.\\\\d{1,2})?|[\\\\d,]+(?:\\\\.\\\\d{1,2})?\\\\s?" + CURRENCY + "\\\\b", "i");
const VERB = /\\b(debited|credited|spent|purchase|purchased|paid|payment|withdrawn|withdrawal|transferred|transfer|salary|refund|refunded|deposit|deposited|charged|deducted|received|installment|transaction)\\b/i;
const CODE = /\\b(otp|one[- ]?time (?:password|code|pin)|verification code|security code|passcode)\\b[^.\\n]{0,60}?\\b\\d{4,8}\\b/i;

function looksLikeTransaction(text) {
  return AMOUNT.test(text) && VERB.test(text) && !CODE.test(text);
}

function syncBankEmails() {
  if (SPENDLY_URL.indexOf("PASTE_") === 0) throw new Error("Paste your Shortcut URL first.");
  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const since = Math.max(Number(props.getProperty("since")) || 0, monthStart); // first run: start of this month
  const runStarted = Date.now();

  let query = "after:" + Math.floor(since / 1000) + " -category:promotions -category:social";
  if (ONLY_FROM.length) query += " from:(" + ONLY_FROM.join(" OR ") + ")";

  let sent = 0, skipped = 0, retry = false;
  GmailApp.search(query, 0, 100).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (m.getDate().getTime() < since) return;
      const text = (m.getSubject() + "\\n" + m.getPlainBody()).slice(0, 4000);
      if (!looksLikeTransaction(text)) { skipped++; return; }
      const res = UrlFetchApp.fetch(SPENDLY_URL, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ text: text, receivedAt: m.getDate().toISOString(), source: "EMAIL" }),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code === 401) throw new Error("Spendly rejected the key. Paste a fresh Shortcut URL.");
      if (code === 429 || code >= 500) retry = true; else sent++;
    });
  });
  // Only move the bookmark forward when everything went through; Spendly ignores repeats anyway.
  if (!retry) props.setProperty("since", String(runStarted - 60 * 1000));
  console.log("Sent " + sent + " email(s) to Spendly, left " + skipped + " in Gmail." + (retry ? " Some will be retried." : ""));
}

// Run once to test. Then run install() once to repeat it every 10 minutes.
function install() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("syncBankEmails").timeBased().everyMinutes(10).create();
}
`;
