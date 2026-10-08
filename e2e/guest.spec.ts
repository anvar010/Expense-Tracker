import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

test.beforeEach(async ({ page }) => {
  await page.goto("/dashboard");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function addTx(page: import("@playwright/test").Page, amount: string, merchant: string, category = "Food & Dining") {
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Category").selectOption(category);
  await page.getByLabel("Merchant").fill(merchant);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("guest can add a transaction and sees it on the dashboard and list; data survives reload", async ({ page }) => {
  await expect(page.getByText("Guest · saved on this device")).toBeVisible();
  await expect(page.getByText("No transactions yet")).toBeVisible();
  await addTx(page, "45.50", "Talabat");
  await expect(page.getByText("−AED 45.50").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("AED 45.50").first()).toBeVisible();
  await page.getByRole("link", { name: "Transactions" }).first().click();
  await expect(page.getByRole("button", { name: /Talabat/ })).toBeVisible();
});

test("validation: bad amount is rejected", async ({ page }) => {
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  await page.getByLabel("Amount").fill("abc");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Enter a valid amount")).toBeVisible();
});

test("message analyzer parses sample 1, saves, and OTPs are ignored", async ({ page }) => {
  await page.goto("/messages");
  await page.getByRole("button", { name: "Sample 1" }).click();
  await expect(page.locator("#d-merchant")).toHaveValue("Talabat");
  await expect(page.locator("#d-cat")).toHaveValue("Food & Dining");
  await expect(page.locator("#d-amount")).toHaveValue("45.00");
  await expect(page.getByText("Looks good")).toBeVisible();
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("status")).toContainText("Saved Talabat");
  // saving the same message again warns about a duplicate
  await page.getByRole("button", { name: "Sample 1" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("already exists");
  await page.getByLabel("Bank message").fill("Your OTP for AED 500 payment at AMAZON is 482913");
  await expect(page.getByText("OTP or security code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to review queue" })).toBeHidden();
});

test("ambiguous message goes to the review queue instead of creating a transaction", async ({ page }) => {
  await page.goto("/messages");
  await page.getByLabel("Bank message").fill("AED 80 spent at AMAZON.AE on 02/10/2026");
  await expect(page.getByText("Please review")).toBeVisible();
  await page.getByRole("button", { name: "Send to review queue" }).click();
  await expect(page.getByText("Review queue (1)")).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByText("No transactions yet")).toBeVisible();
});

test("account, budget and over-budget notification", async ({ page }) => {
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Name").fill("Main");
  await page.getByLabel("Opening balance").fill("1000");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("AED 1,000.00")).toBeVisible();

  await page.goto("/budgets");
  await page.getByRole("button", { name: "Add budget" }).click();
  await page.getByLabel("Amount").fill("100");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("of AED 100.00")).toBeVisible();

  await addTx(page, "120", "Mall", "Shopping");
  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(page.getByText("Overall budget exceeded")).toBeVisible();
});

test("credit card full flow: purchase raises owed, payment clears it, not double counted", async ({ page }) => {
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Name").fill("Bank");
  await page.getByLabel("Opening balance").fill("1000");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Name").fill("Visa");
  await page.getByLabel("Type").selectOption("CREDIT_CARD");
  await page.getByLabel("Credit limit").fill("5000");
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Add transaction" }).first().click();
  await page.getByLabel("Amount").fill("300");
  await page.getByLabel("Account", { exact: true }).selectOption({ label: "Visa" });
  await page.getByRole("button", { name: "Save" }).click();
  await page.goto("/accounts");
  const visa = page.locator("li", { hasText: "Visa" });
  await expect(visa.getByText("AED 300.00").first()).toBeVisible();
  await expect(visa.getByText("Utilization 6%")).toBeVisible();

  await page.getByRole("button", { name: "Add transaction" }).first().click();
  await page.getByLabel("Type").selectOption("CARD_PAYMENT");
  await page.getByLabel("Amount").fill("300");
  await page.getByLabel("From account").selectOption({ label: "Bank" });
  await page.getByLabel("Card paid").selectOption({ label: "Visa" });
  await page.getByRole("button", { name: "Save" }).click();
  await page.goto("/accounts");
  await expect(page.locator("li", { hasText: "Visa" }).getByText("AED 0.00").first()).toBeVisible();
  await expect(page.locator("li", { hasText: "Bank" }).getByText("AED 700.00").first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText("AED 300.00").first()).toBeVisible(); // expenses stay 300, not 600
});

test("CSV statement import: preview, flags duplicates, imports on confirm", async ({ page }) => {
  await addTx(page, "45", "Talabat");
  const file = path.join(os.tmpdir(), "stmt.csv");
  fs.writeFileSync(file, "Date,Description,Debit,Credit,Balance\n" + new Date().toLocaleDateString("en-GB") + ",POS TALABAT DUBAI,45.00,,100\n09/10/2026,SALARY CREDIT,,5000.00,5100\n10/10/2026,CARREFOUR UAE,135.75,,4964\n");
  await page.goto("/import");
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText("3 of 3 selected").or(page.getByText("2 of 3 selected"))).toBeVisible();
  await expect(page.getByText("possible duplicate").first()).toBeVisible();
  await page.getByRole("button", { name: /^Import \d+ transactions$/ }).click();
  await expect(page.getByText(/Imported 2 transactions/)).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByText("Carrefour")).toBeVisible();
  await expect(page.getByRole("button", { name: /Talabat/ })).toHaveCount(1);
});

test("rejects unsupported and spoofed statement files", async ({ page }) => {
  await page.goto("/import");
  const exe = path.join(os.tmpdir(), "evil.exe"); fs.writeFileSync(exe, "MZ");
  await page.locator('input[type=file]').setInputFiles(exe);
  await expect(page.locator("p[role=alert]")).toContainText("Unsupported file type");
  const fake = path.join(os.tmpdir(), "fake.pdf"); fs.writeFileSync(fake, "not a pdf");
  await page.locator('input[type=file]').setInputFiles(fake);
  await expect(page.locator("p[role=alert]")).toContainText("doesn't look like a PDF");
});

test("insights: answers a question from local data", async ({ page }) => {
  await addTx(page, "75", "Talabat");
  await page.goto("/insights");
  await page.getByLabel("Question").fill("How much did I spend on food this month?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText(/You spent AED\s75\.00 on Food & Dining this month/)).toBeVisible();
});

test("sign-in with the database down shows a helpful message and guest mode still works", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /New here/ }).click();
  await page.getByLabel("Name").fill("A");
  await page.getByLabel("Email").fill("a@b.co");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Database is not connected");
  await page.getByRole("link", { name: "Continue as guest" }).click();
  await expect(page).toHaveURL(/dashboard/);
});

test("PWA: manifest, service worker, and the app opens offline", async ({ page, context }) => {
  await page.goto("/dashboard");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await addTx(page, "12", "Starbucks");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Guest · saved on this device")).toBeVisible();
  await expect(page.getByText("AED 12.00").first()).toBeVisible();
  await expect(page.getByText(/You're offline/)).toBeVisible();
  await context.setOffline(false);
});

test("mobile layout: bottom nav and floating add button", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Budgets" }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Add transaction" }).last()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
