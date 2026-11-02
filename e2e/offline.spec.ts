import { expect, test, type Page } from "@playwright/test";

// A signed-in session with a stubbed API, so the save queue can be exercised without a database.
async function signedInApp(page: Page) {
  const state = { down: false, posted: [] as string[], delay: 0 };
  await page.route("**/api/**", (route) => route.fulfill({ json: { ok: true, data: [] } }));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ok: true, data: { id: "u1", name: "Tester", email: "t@t.co", role: "USER" } } }));
  await page.route("**/api/transactions", async (route) => {
    if (state.down) return route.abort("internetdisconnected");
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      state.posted.push(body.merchant);
      if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
      return route.fulfill({ status: 201, json: { ok: true, data: { ...body, id: `srv-${state.posted.length}`, createdAt: new Date().toISOString() } } });
    }
    return route.fulfill({ json: { ok: true, data: [] } });
  });
  await page.addInitScript(() => { if (!sessionStorage.getItem("cleared")) { localStorage.clear(); sessionStorage.setItem("cleared", "1"); } });
  await page.goto("/dashboard");
  await expect(page.getByText("Tester").first()).toBeVisible();
  return state;
}

async function addEntry(page: Page, amount: string, merchant: string) {
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Merchant").fill(merchant);
  await page.getByRole("button", { name: "Save" }).click();
}

test("saving doesn't wait for the server", async ({ page }) => {
  const state = await signedInApp(page);
  state.delay = 3000; // a very slow server
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  await page.getByLabel("Amount").fill("12");
  await page.getByLabel("Merchant").fill("Slow Cafe");
  const t0 = Date.now();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 2500 });
  expect(Date.now() - t0).toBeLessThan(2000); // the server takes 3s; the form must not wait for it
  await page.goto("/transactions");
  await expect(page.getByText("Slow Cafe")).toBeVisible();
});

test("offline entries are queued and sent in the order they were added once the network returns", async ({ page }) => {
  const state = await signedInApp(page);
  state.down = true;
  for (const [amount, merchant] of [["10", "First"], ["20", "Second"], ["30", "Third"]]) {
    await addEntry(page, amount, merchant);
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 1000 });
  }
  await expect(page.getByText(/Offline · 3 waiting to sync/)).toBeVisible();
  expect(state.posted).toEqual([]);

  state.down = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => state.posted).toEqual(["First", "Second", "Third"]);
  await expect(page.getByText(/waiting to sync/)).toBeHidden();
  await expect(page.getByText("Tester").first()).toBeVisible();
});
