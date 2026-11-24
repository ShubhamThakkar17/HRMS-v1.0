# Silver Touch HRMS: project guide for Claude Code

Read this file at the start of every session. The step-by-step build order is in `HRMS_BUILD_PLAN.md`. Work one phase at a time and do not start a phase until the previous one passes its checks.

## What we are building

An in-house HRMS for Silver Touch: employee records, attendance (web, GPS geofence, face punch, office kiosk code), leave, attendance corrections, expense claims, approvals, reports, a payroll preview, roles and permissions, an audit log and a nightly Google Sheets backup. A working prototype exists at the claude.ai link in the plan. Match its behaviour unless the plan says otherwise.

## Stack

- Next.js (App Router) with TypeScript in strict mode, deployed on Vercel
- PostgreSQL in an India region (Supabase or Neon, Mumbai), accessed through Prisma
- Auth.js with Google Workspace sign-in plus email one-time codes for staff without Google accounts
- Tailwind CSS with the design tokens in `src/styles/tokens.css` (Silver Touch brand colours go there only)
- Zod for every input that crosses a trust boundary (forms, API routes, webhooks)
- Vitest for unit tests, Playwright for end-to-end tests
- The app is a PWA: installable on phones, works over HTTPS so camera and GPS are available

## Folder layout

```
src/
  app/                 routes (one folder per screen), API route handlers under app/api
  components/          shared UI
  server/              server-only code: db, auth, rbac, services per module
    services/          attendance.ts, leave.ts, expenses.ts, payroll.ts, sheets.ts, audit.ts
  lib/                 pure helpers usable on client and server (dates, geo, kiosk code)
  styles/tokens.css
prisma/schema.prisma
tests/unit, tests/e2e
```

## Rules that always apply

1. Every server action and API route checks permission with `requirePermission(user, 'perm.key')` from `src/server/rbac.ts`. Never trust the client to hide a button.
2. Every write that changes HR data also writes an `AuditLog` row in the same transaction.
3. Dates are stored as `date` (no time) in IST business dates. Times are stored as `timestamptz`. Convert with helpers in `src/lib/dates.ts` only.
4. Money is stored as integer paise. Format with `formatINR()`.
5. Face data: store only the 128-number template, never the photo. Templates are encrypted at rest with a key from the environment. Enrolment needs recorded consent.
6. Location: store latitude, longitude, accuracy and distance to the nearest office with each punch. Never track location outside a punch.
7. No secrets in code or in the repo. Use `.env.local` and Vercel environment variables.
8. Write a unit test for every business rule (leave days, balances, geofence, kiosk code, payroll maths) before wiring the UI.
9. Keep changes small. After each step run `npm run lint`, `npm run typecheck` and `npm test`, and fix failures before moving on.
10. When a requirement is unclear, stop and ask instead of guessing.

## Commands

```
npm run dev          local server
npm run lint
npm run typecheck
npm test             unit tests
npm run test:e2e     Playwright
npx prisma migrate dev
npx prisma db seed   loads the sample company from prisma/seed.ts
```
