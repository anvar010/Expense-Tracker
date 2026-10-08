package com.spendly.companion

/**
 * On-device gate. A message is only queued if it looks like a bank transaction and contains no
 * security code. Everything else is dropped immediately and never stored or sent.
 */
object FinancialFilter {
    private val secret = Regex("""\b(otp|one[- ]?time|verification code|cvv|pin|password|passcode)\b""", RegexOption.IGNORE_CASE)
    private val amount = Regex("""(AED|DHS?\.?|USD|INR|RS\.?|EUR|GBP|[$₹€£])\s?\d""", RegexOption.IGNORE_CASE)
    private val amountAfter = Regex("""\d\s?(AED|USD|INR|EUR|GBP)\b""", RegexOption.IGNORE_CASE)
    private val verb = Regex("""\b(debited|credited|spent|purchase|paid|payment|withdrawn|withdrawal|transferred|transfer|salary|refund|deposit|charged)\b""", RegexOption.IGNORE_CASE)

    fun looksFinancial(body: String): Boolean {
        if (body.length > 1000) return false
        if (secret.containsMatchIn(body)) return false
        return (amount.containsMatchIn(body) || amountAfter.containsMatchIn(body)) && verb.containsMatchIn(body)
    }
}
