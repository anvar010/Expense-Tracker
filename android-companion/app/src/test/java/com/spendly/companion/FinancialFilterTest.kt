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

class SmsReaderTest {
    @Test fun messageIdsAreStablePerSms() {
        org.junit.Assert.assertEquals("sms-42", SmsReader.messageId(42))
        org.junit.Assert.assertEquals(SmsReader.toPending(42, "AED 45.00 debited at TALABAT", 1000)?.messageId, SmsReader.toPending(42, "AED 45.00 debited at TALABAT", 1000)?.messageId)
    }
    @Test fun onlyBankMessagesAreKept() {
        org.junit.Assert.assertNotNull(SmsReader.toPending(1, "Your card ending 1234 was debited AED 45.00 at TALABAT", 0))
        org.junit.Assert.assertNull(SmsReader.toPending(2, "Dinner tonight? I'll pay", 0))
        org.junit.Assert.assertNull(SmsReader.toPending(3, "Your OTP for AED 500 payment is 482913", 0))
    }
    @Test fun monthStartIsFirstDayMidnight() {
        val now = java.time.ZonedDateTime.of(2026, 10, 18, 15, 30, 0, 0, java.time.ZoneId.of("Asia/Dubai"))
        val start = java.time.Instant.ofEpochMilli(SmsReader.startOfMonth(now)).atZone(java.time.ZoneId.of("Asia/Dubai"))
        org.junit.Assert.assertEquals(1, start.dayOfMonth); org.junit.Assert.assertEquals(0, start.hour); org.junit.Assert.assertEquals(10, start.monthValue)
    }
}
