# Spendly: Expense Tracker

Next.js (App Router) + Prisma + MySQL personal finance PWA.

## How data is stored
- **Guest** ("Continue as guest"): everything lives in this browser's `localStorage`.
- **Signed in**: stored in MySQL via Prisma; a cached copy is kept on the device.
- **Database unreachable**: signed-in users see their cached data; transaction changes queue locally and sync (idempotent) when the database is back. Accounts, budgets and recurring payments are read-only until it returns.
- **Sign out** wipes the cached account data, queue and notifications from the device. Guest data is separate and untouched.

## Setup
```bash
npm install
cp .env.example .env     # DATABASE_URL (or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD), SESSION_SECRET (32+ chars)
# create the database first:  CREATE DATABASE expense_tracker;
npm run db:migrate       # applies prisma/migrations
npm run dev
npm test                 # unit tests (Vitest)
npm run test:e2e         # browser tests (Playwright; builds and serves the app with no database)
```
Optional AI (server-side only): set `ANTHROPIC_API_KEY`. `AI_PROVIDER=none` disables AI. Providers sit behind `src/lib/ai/provider.ts`.

## Features
| Area | Where |
|---|---|
| Dashboard (balance, income, expenses, savings, budget used, charts, upcoming payments) | `/dashboard` |
| Transactions: add/edit/delete, search, filters, CSV export | `/transactions` |
| Accounts: balances from opening balance + transactions, credit-card owed/limit/utilization/due date, transfers, card payments (not double-counted), reconciliation | `/accounts` |
| Budgets: overall/category, weekly/monthly/custom, progress, history, suggestions, 80/90/100% alerts (bell + browser notifications) | `/budgets` |
| Message analyzer: parse pasted bank SMS/email, local review queue, learned category rules | `/messages`, `src/lib/parser/` |
| Statement import: CSV, XLSX, PDF (best effort); preview, duplicate flags, confirm before saving | `/import` |
| Insights: month-vs-month, subscriptions, unusual spending, recurring detection (confirm to track), Q&A over your data | `/insights` |
| PWA: installable, offline shell, update prompt, offline banner | `public/sw.js`, `src/app/manifest.ts` |

## Security notes
- Passwords hashed with bcrypt; sessions are signed, httpOnly cookies. Every query is scoped by the signed-in user's id.
- Only the last 4 digits of a card are accepted; full numbers, CVVs and passwords are never stored.
- AI receives only computed figures or redacted merchant text, never raw transactions; no model-written SQL anywhere.
- The service worker never caches `/api/*`.

## Known limits and not yet verified
- **MySQL:** the migration and the API (register, login, accounts, per-user isolation) were exercised against a real local MySQL 9 install. The browser UI has only been tested in guest/no-database mode, and the offline-sync queue against a live database has not been exercised.
- **Bank templates** (`src/lib/parser/templates.ts`) are representative, not verified against real bank SMS. Generic parsing handles the rest, and uncertain messages go to the review queue.
- **PDF statements** are best-effort and inferred from running balances; XLSX/PDF reading is covered by unit tests of the logic, not by a browser test.
- **Not built:** push notifications (only local/browser notifications), budget rollover, Excel export, bulk categorise, multi-currency conversion, server-side aggregation (the dashboard computes in the browser), password reset, profile/settings page, data export and account deletion.
- Learned category rules and the review queue live in the browser.
