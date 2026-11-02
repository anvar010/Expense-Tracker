import { expect, test } from "@playwright/test";

test("guests are asked to sign in before using Apple Pay auto-save", async ({ page }) => {
  await page.goto("/wallet");
  await expect(page.getByRole("heading", { name: "Apple Pay auto-save" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
});

test("a signed-in user can create a private link once and sees the setup steps", async ({ page }) => {
  let created = false;
  await page.route("**/api/**", (route) => route.fulfill({ json: { ok: true, data: [] } }));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ok: true, data: { id: "u1", name: "Tester", email: "t@t.co", role: "USER" } } }));
  await page.route("**/api/wallet/key", (route) => {
    if (route.request().method() === "POST") { created = true; return route.fulfill({ status: 201, json: { ok: true, data: { key: "etw_demo" } } }); }
    return route.fulfill({ json: { ok: true, data: { exists: created, key: created ? "etw_demo" : null, createdAt: created ? new Date().toISOString() : null, lastUsedAt: null, lastAttemptAt: created ? new Date().toISOString() : null, lastStatus: created ? "Not saved: No amount found" : null, lastBody: created ? "Test Shop" : null } } });
  });
  await page.goto("/wallet");
  await page.getByRole("button", { name: "Create my link" }).click();
  await expect(page.getByLabel("Private link")).toHaveValue(/\/api\/wallet\?key=etw_demo$/);
  await expect(page.getByText("Keep it private")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download shortcut" })).toHaveAttribute("href", "/Spendly%20Apple%20Pay.shortcut");
  await expect(page.getByRole("button", { name: "Create a new link" })).toBeVisible();
  await expect(page.getByText("Not saved: No amount found")).toBeVisible(); // the last request is explained
  await expect(page.getByText("Test Shop")).toBeVisible();
  await page.reload(); // the link is still there afterwards, it isn't a one-time display
  await expect(page.getByLabel("Private link")).toHaveValue(/key=etw_demo$/);
});
