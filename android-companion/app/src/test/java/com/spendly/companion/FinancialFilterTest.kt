package com.spendly.companion

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FinancialFilterTest {
    @Test fun acceptsBankTransactions() {
        assertTrue(FinancialFilter.looksFinancial("Your card ending 1234 was debited AED 45.00 at TALABAT on 08/10/2026."))
        assertTrue(FinancialFilter.looksFinancial("Salary credit of AED 5000 received in your account."))
        assertTrue(FinancialFilter.looksFinancial("AED 200 transferred from your account to another account."))
    }
    @Test fun dropsOtpsAndPersonalMessages() {
        assertFalse(FinancialFilter.looksFinancial("Your OTP for AED 500 payment is 482913"))
        assertFalse(FinancialFilter.looksFinancial("Lunch at 1pm? I'll pay"))
        assertFalse(FinancialFilter.looksFinancial("Happy birthday!"))
    }
}
