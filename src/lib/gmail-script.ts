/**
 * Google Apps Script that runs inside the user's own Google account and sends bank emails to Spendly.
 * Shown on the Devices page. It only reads emails from the senders listed in SENDERS.
 */
export const GMAIL_SCRIPT = `// Spendly: send this month's bank emails to your account.
// Runs inside your own Google account and only reads emails from the senders listed below.

// 1) Paste your Shortcut URL from the Spendly Devices page (it contains your private key).
const SPENDLY_URL = "PASTE_YOUR_SHORTCUT_URL_HERE";

// 2) Words from the sender's name or address. Add your banks here, for example "adcb", "enbd".
const SENDERS = ["mashreq", "tabby"];

const LABEL = "Spendly-sent"; // emails already sent get this label, so nothing is sent twice

function syncBankEmails() {
  if (SPENDLY_URL.indexOf("PASTE_") === 0) throw new Error("Paste your Shortcut URL first.");
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const now = new Date();
  const since = now.getFullYear() + "/" + (now.getMonth() + 1) + "/01"; // this month only
  const query = "from:(" + SENDERS.join(" OR ") + ") after:" + since + " -label:" + LABEL;

  let sent = 0;
  GmailApp.search(query, 0, 50).forEach(function (thread) {
    let allDone = true;
    thread.getMessages().forEach(function (m) {
      const text = (m.getSubject() + "\\n" + m.getPlainBody()).slice(0, 4000);
      const res = UrlFetchApp.fetch(SPENDLY_URL, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ text: text, receivedAt: m.getDate().toISOString(), source: "EMAIL" }),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code === 401) throw new Error("Spendly rejected the key. Paste a fresh Shortcut URL.");
      if (code === 429 || code >= 500) allDone = false; // try again on the next run
      else sent++;
    });
    if (allDone) thread.addLabel(label);
  });
  console.log("Sent " + sent + " email(s) to Spendly.");
}

// Run once to check everything works. Then run install() once to repeat it every 10 minutes.
function install() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("syncBankEmails").timeBased().everyMinutes(10).create();
}
`;
