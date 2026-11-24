# Silver Touch HRMS

An in-house HR management system for Silver Touch: employee records, attendance (web, GPS geofence, face punch, office kiosk code),
leave, attendance corrections, expense claims, one approvals inbox, reports, an executive dashboard, a payroll preview, roles and
permissions, an audit log and a nightly Google Sheets backup.

It is the full build of the clickable prototype described in [`docs/HRMS_prototype_plan.md`](docs/HRMS_prototype_plan.md), following
[`HRMS_BUILD_PLAN.md`](HRMS_BUILD_PLAN.md) and the rules in [`CLAUDE.md`](CLAUDE.md).

## Stack

Next.js 15 (App Router, TypeScript strict) · PostgreSQL + Prisma · Auth.js (Google Workspace + email one-time code) · Tailwind CSS 4 ·
Zod · Vitest · Playwright · face-api (on-device face recognition) · installable PWA.

## Quick start (local)

```bash
cp .env.example .env.local        # then fill the secrets (see below)
cp .env.local .env                # the Prisma CLI reads .env
npm install                       # also generates Prisma client and copies face models to public/models
npx prisma migrate dev            # create tables
npx prisma db seed                # load the sample company (14 people, 7 roles, ~6 weeks of attendance)
npm run dev                       # http://localhost:3000
```

Generate keys with `openssl rand -base64 32` for `AUTH_SECRET`, `FACE_TEMPLATE_KEY` and `APP_ENCRYPTION_KEY`.

With `AUTH_DEMO=true`, the sign-in page shows demo profiles; every password is `demo123`:

| Profile        | Email               | Roles                  |
| -------------- | ------------------- | ---------------------- |
| Super Admin    | aditya@demo.example | Super Admin, Employee  |
| Director       | meera@demo.example  | Director, Employee     |
| HR Admin       | priya@demo.example  | HR Admin, Employee     |
| HR Executive   | pooja@demo.example  | HR Executive, Employee |
| Finance        | neha@demo.example   | Finance, Employee      |
| Manager        | rohan@demo.example  | Manager, Employee      |
| Employee       | ananya@demo.example | Employee               |
| Field employee | harsh@demo.example  | Employee (remote)      |

The seed prints a demo kiosk link (`/kiosk/<id>?k=demo-kiosk-token`). **Never enable `AUTH_DEMO` in production.**

## Commands

```bash
npm run dev            # local server
npm run lint
npm run typecheck
npm test               # unit + integration tests (needs Postgres; uses TEST_DATABASE_URL or localhost/hrms_test)
npm run build && npm run test:e2e   # Playwright journeys against a freshly seeded hrms_e2e database
npx prisma migrate dev
npx prisma db seed
scripts/backup.sh                  # pg_dump backup (DATABASE_URL)
scripts/restore-drill.sh           # back up, restore to a scratch DB, compare every table's row count
```

## Modules and where they live

| Module                      | Screens                                                                                                             | Server logic                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Sign-in, roles, permissions | `/login`, sidebar role switcher, `/admin/roles`                                                                     | `src/server/auth.ts`, `src/server/rbac.ts`, `src/lib/permissions.ts`                        |
| Employee records            | `/hr/employees`, `/hr/employees/new`, `/hr/employees/[id]`, `/admin/import`, `/directory`, `/org-chart`, `/profile` | `services/employees.ts`, `services/import.ts`                                               |
| Attendance                  | `/punch`, `/my/attendance`, `/team`, `/team/attendance`, `/hr/attendance`                                           | `services/attendance.ts`, `services/punch.ts`, `lib/attendance-rules.ts`                    |
| GPS geofence                | `/punch`, `/admin/settings` (offices + map)                                                                         | `lib/geo.ts` (haversine, work-mode rules)                                                   |
| Face punch                  | `/profile` (consent + enrol), `/punch`                                                                              | `components/face/*` (on device), `services/face.ts` (encrypted template, match, rate limit) |
| Office kiosk                | `/kiosk/[deviceId]`, `/admin/kiosk`                                                                                 | `lib/kiosk.ts` (RFC 6238 TOTP), `services/kiosk.ts`                                         |
| Leave and holidays          | `/my/leave`, `/hr/leave` (incl. leave types), `/holidays`                                                           | `services/leave.ts`, `lib/leave-rules.ts`                                                   |
| Corrections + approvals     | `/my/attendance`, `/approvals`                                                                                      | `services/regularisation.ts`, `services/approvals.ts`, `services/notify.ts`                 |
| Expenses                    | `/my/expenses`, `/finance/expenses` (+ CSV)                                                                         | `services/expenses.ts`, `services/storage.ts`                                               |
| Reports + payroll           | `/leadership/dashboard`, `/leadership/reports`, `/finance/payroll`, `/my/payslip`                                   | `services/reports.ts`, `services/payroll.ts`, `lib/payroll-rules.ts`                        |
| Sheets backup + audit       | `/admin/sync`, `/admin/audit`                                                                                       | `services/sheets.ts`, `services/audit.ts`                                                   |
| Privacy                     | `/privacy`, `/profile` (data export, withdraw consent)                                                              | `services/privacy.ts`                                                                       |

## Rules the code enforces

- Every server action and API route checks permission through `requirePermission()` (or `canDecide()` for approvals); hidden buttons are never the only guard.
- Every HR write also writes an `AuditLog` row in the same transaction, with before and after values.
- Business dates are IST `date` columns; instants are `timestamptz`; all conversion is in `src/lib/dates.ts`.
- Money is integer paise, formatted with `formatINR()`.
- Face: only 128-number templates, AES-256-GCM encrypted, after recorded consent; no image leaves the device.
- Location is recorded only with a punch; the server recomputes distance; precise coordinates are purged after the retention period.
- Nobody approves their own request; approval deducts leave balance in the same transaction and is blocked when it would go negative.
- Mutations are protected against CSRF (server actions check Origin; JSON APIs check Origin explicitly); strict security headers are set in `next.config.ts`.

## Scheduled jobs (`vercel.json`, authorised with `CRON_SECRET`)

| Job                        | Schedule (UTC)  | IST            | What it does                                                      |
| -------------------------- | --------------- | -------------- | ----------------------------------------------------------------- |
| `/api/cron/finalise-day`   | 18:00 daily     | 23:30          | Finalises the day; marks absent anyone with no punch and no leave |
| `/api/cron/sheets-backup`  | 20:30 daily     | 02:00          | Writes every table to the linked Google Sheet                     |
| `/api/cron/retention`      | 21:00 daily     | 02:30          | Clears precise coordinates older than the retention period        |
| `/api/cron/leave-rollover` | 18:35 on 31 Dec | 00:05 on 1 Jan | Opens the new year's balances with capped carry forward           |

## Deploying (recommended defaults from the plan)

1. Create a Postgres database in Mumbai (Supabase or Neon) and set `DATABASE_URL`.
2. Create a Vercel project from this repository. `vercel.json` pins functions to `sin1` (Singapore) to sit next to the pilot database; use `bom1` with a Mumbai database.
3. Set the environment variables from `.env.example` in Vercel (production values, `AUTH_DEMO` unset).
4. Google sign-in: create an OAuth client (Web), add `https://<domain>/api/auth/callback/google`, set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `AUTH_GOOGLE_HD` (your Workspace domain).
5. Email codes: set `RESEND_API_KEY` and `EMAIL_FROM` (verified sender domain).
6. Receipts: set `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and create a **private** bucket `receipts`.
7. Sheets backup: create a Google Cloud service account with the Sheets API enabled, set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`, and share the sheet with that email as an editor.
8. Run `npx prisma migrate deploy` against production, then import real employees from `/admin/import` (or seed a pilot).

## Status against the build plan

| Phase                     | State                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Tooling                 | Done: Next.js, TS strict, Tailwind, ESLint, Prettier, Vitest, Playwright, CI workflow                                                                                                                                        |
| 1 DB, sign-in, roles      | Done: full Prisma model, seed, Auth.js (Google + email code + demo), RBAC with active-role switcher                                                                                                                          |
| 2 Employee records        | Done: list/search/filter, add, edit, deactivate, roles (emp.roles only), last-Super-Admin and self-deactivation guards, directory, org chart, audit                                                                          |
| 3 Attendance core         | Done: punches, day rebuild (late, short day, holidays, weekends, leave), 23:30 IST finalise job, my/team/HR views, HR correction                                                                                             |
| 4 GPS geofence            | Done: high-accuracy GPS with clear errors, server haversine, work-mode rules, 150 m accuracy limit, office settings with map, PWA                                                                                            |
| 5 Face punch              | Done: consent notice, 3-sample enrolment, encrypted templates, server matching with threshold, head-turn liveness, GPS in the same step, withdraw, rate limit. Needs a real-device check on Android Chrome and iPhone Safari |
| 6 Kiosk code              | Done: RFC 6238 TOTP kiosk screen, current/previous window, register/revoke                                                                                                                                                   |
| 7 Leave + holidays        | Done: types admin, yearly balances, 1 Jan rollover with capped carry forward, working-day counting, overlap and balance checks, per-office holidays                                                                          |
| 8 Corrections + approvals | Done: regularisation, one inbox, reject needs a reason, REGULARISED punches rebuild the day, email notifications, sidebar badge                                                                                              |
| 9 Expenses                | Done: receipts up to 10 MB (type sniffed), private storage with signed URLs, manager → Finance flow, Finance totals, CSV export                                                                                              |
| 10 Reports + payroll      | Done: executive dashboard, reports, payroll preview and printable payslip                                                                                                                                                    |
| 11 Sheets + audit         | Done: service-account backup (one tab per table, never face data or secrets), Sync now with per-tab results, audit log with filters                                                                                          |
| 12 Hardening + privacy    | Done: rate limits, CSRF checks, security headers, Zod validation, privacy notice, consent records, coordinate retention job, personal data export, backup + restore drill script                                             |
| 13 Pilot                  | CSV import with validation preview and per-office face/GPS flags are done. Biometric device webhooks wait for a device choice, as the plan says                                                                              |

Open decisions from the plan still stand: hosting account, final database provider, biometric devices, payroll provider, and the
Silver Touch brand sheet (logo, colours, typeface). Brand colours live only in `src/styles/tokens.css`.
