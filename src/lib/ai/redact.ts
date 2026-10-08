/**
 * Removes account/card references and contact details before any text leaves the server for an AI provider.
 * Amounts, merchants and dates are kept because the model needs them.
 */
export function redactForAi(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/(?<![\d.,])\+?\d[\d\s-]{8,}\d(?![\d.,])/g, "[number]") // phone numbers and long digit runs
    .replace(/\b(ending|ends|card|a\/c|acct|account)(\s*(no\.?|number|#|with|in))?\s*[:\-]?\s*[x*•]*\d{4}\b/gi, "$1 [ref]")
    .replace(/\b[x*•]{2,}\d{2,4}\b/gi, "[ref]")
    .replace(/\bAE\d{2}[\dA-Z]{10,}\b|\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, "[iban]");
}
