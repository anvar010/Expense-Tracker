import { defineConfig } from "@playwright/test";

// Runs against a production build, with no database, which is exactly the guest / "database down" path.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3120", viewport: { width: 1280, height: 800 } },
  webServer: {
    command: "npx next build && npx next start -p 3120",
    url: "http://localhost:3120/login",
    timeout: 180_000,
    reuseExistingServer: false,
    // Point at an unreachable database so these tests always cover the guest / database-down path,
    // whatever is running on the machine.
    env: { DATABASE_URL: "mysql://nobody:nothing@127.0.0.1:1/none" },
  },
});
