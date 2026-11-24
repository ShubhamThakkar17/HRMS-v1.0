# Silver Touch HRMS: step-by-step build plan for Claude Code

Put this file and `CLAUDE.md` in the root of a new repository. Then, for each phase, open Claude Code in the repository and paste the phase's prompt. Do not start the next phase until every check in the current one passes.

Reference prototype (behaviour to match): https://claude.ai/artifact/2b4tm3UdybYCGREY9T1Jqu
Prototype data backup: the "Silver Touch HRMS Data (prototype)" Google Sheet.

## Decisions to make before Phase 1

| Decision | Recommended default | Why |
| --- | --- | --- |
| Hosting | Vercel (app) + Supabase or Neon Postgres in Mumbai | Simple to run, India-region data |
| Sign-in | Google Workspace sign-in plus email one-time code | No passwords to manage |
| Face punch | On-device matching first (face-api), cloud liveness later | No vendor approval needed to start |
| Biometric devices | Not in this build. Add in Phase 13 if still needed | Face, GPS and kiosk punches cover most cases |
| Payroll | Preview only. Statutory payroll stays with the current provider | PF, ESI, PT and TDS rules change often |

Two outside rules affect this build:

- If you later move face matching to Azure, note that Face identification and verification are Limited Access features that need a registration form and Microsoft approval. Face detection alone does not.
- India's DPDP Rules were notified in November 2025 with an 18-month phased compliance period. Build consent, notices and retention for face and location data from the start (Phase 5 and Phase 12).

## Data model (Prisma, Phase 1)

| Model | Key fields |
| --- | --- |
| Employee | id, code (E001), name, email, phone, dept, title, managerId, joinedOn, status, workMode (OFFICE, HYBRID, REMOTE), officeId, ctcPaise |
| Role | id, name, permissions (string[]), isSystem |
| EmployeeRole | employeeId, roleId |
| Office | id, code, name, lat, lng, radiusM |
| Shift | id, start, end, lateAfter, shortDayHours |
| Punch | id, employeeId, at (timestamptz), businessDate, direction (IN, OUT), method (WEB, GEO, FACE, KIOSK, HR, REGULARISED), lat, lng, accuracyM, distanceM, officeId, faceScore, flag (OUTSIDE_GEOFENCE), deviceInfo |
| AttendanceDay | employeeId, businessDate, firstIn, lastOut, hours, status (PRESENT, LATE, SHORT, ABSENT, LEAVE, HOLIDAY, WEEKEND) |
| LeaveType | code, name, annualDays, carryForward |
| LeaveBalance | employeeId, leaveTypeCode, year, opening, accrued, used |
| LeaveRequest | id, employeeId, type, from, to, days, reason, status, approverId, comment, decidedAt |
| Holiday | date, name, officeId (null = all offices) |
| Regularisation | id, employeeId, date, inTime, outTime, reason, status, approverId, comment |
| ExpenseClaim | id, employeeId, date, category, amountPaise, note, receiptKey, status (PENDING, APPROVED, REJECTED, REIMBURSED), approverId, paidById |
| Announcement | id, title, body, authorId, pinned, publishedAt |
| FaceTemplate | employeeId, samples (encrypted bytes), consentAt, consentVersion, updatedAt |
| KioskDevice | id, officeId, name, secret (encrypted), lastSeenAt |
| AuditLog | id, at, actorId, role, action, entity, entityId, detail (json) |
| Setting | key, value (json) |

Permissions are the same 20 keys as the prototype (team.view, approve.team, emp.view, emp.edit, emp.roles, att.all, att.correct, leave.all, leave.approve_all, leave.policy, holidays.manage, announce.post, expense.pay, payroll.view, dash.exec, reports.view, audit.view, sheets.sync, settings.manage, roles.manage). Default roles: Super Admin, Director, HR Admin, HR Executive, Finance, Manager, Employee.

---

## Phase 0. Repository and tooling

**Prompt for Claude Code**

> Read CLAUDE.md and HRMS_BUILD_PLAN.md. Set up the project for Phase 0: create a Next.js App Router project with TypeScript strict mode, Tailwind, ESLint, Prettier, Vitest and Playwright. Add the folder layout from CLAUDE.md, a `src/styles/tokens.css` with placeholder Silver Touch colour tokens, and npm scripts for lint, typecheck, test and test:e2e. Add a GitHub Actions workflow that runs lint, typecheck and unit tests on every pull request. Do not add any HR features yet.

**Checks**

- `npm run lint`, `npm run typecheck` and `npm test` pass
- The CI workflow runs green on a test pull request

## Phase 1. Database, sign-in, roles and permissions

**Prompt**

> Phase 1. Add Prisma with PostgreSQL and create the full data model from the plan's table. Write `prisma/seed.ts` that loads the same 14 sample employees, roles, offices, leave types and holidays as the prototype. Add Auth.js with Google sign-in and email one-time codes, linking each sign-in to an Employee by email; inactive employees cannot sign in. Build `src/server/rbac.ts` with `getPermissions(employee, activeRole)` and `requirePermission()`. Support people with several roles and an "active role" switcher saved in the session. Write unit tests for the permission checks. Build the app shell: sidebar navigation grouped as in the prototype (My work, Company, Team, HR, Finance, Leadership, Admin), showing only allowed items.

**Checks**

- Signing in as each seeded role shows the same menu items as the prototype
- Calling an API route without the permission returns 403 (unit and e2e tests)
- A person with two roles can switch, and the menu changes

## Phase 2. Employee records, directory and org chart

**Prompt**

> Phase 2. Build Employee records (list with search and filters, add, edit, deactivate, assign roles with emp.roles only), My profile (read only), Directory (cards with today's status) and an Org chart built from managerId. Prevent removing the last Super Admin and prevent self-deactivation. Every change writes an AuditLog row. Add e2e tests for add, edit and deactivate.

**Checks**

- HR Executive can edit records but cannot change roles
- Deactivated employees disappear from the directory and cannot sign in
- Audit log shows each change with before and after values

## Phase 3. Attendance core

**Prompt**

> Phase 3. Build attendance with Punch and AttendanceDay. Add the web punch (check in, check out) on a Punch page. Write `src/server/services/attendance.ts` that rebuilds an AttendanceDay from that day's punches, applying the shift (late after, short day), holidays, weekends and approved leave. Add a Vercel Cron job at 23:30 IST that finalises each day and marks absent anyone with no punch and no leave. Build My attendance (month view with method and location columns), Team attendance and HR Attendance (any date, department filter, HR correction with a required reason). Unit-test every status rule with fixed dates.

**Checks**

- A punch after the late threshold shows Late; under the short-day hours shows Short day
- The cron job marks absences correctly for a test day
- HR corrections show method HR and appear in the audit log

## Phase 4. GPS punch with geofences

**Prompt**

> Phase 4. Add the location punch. On the client, request `navigator.geolocation.getCurrentPosition` with high accuracy and a 10 second timeout; show clear messages for denied, unavailable and timed-out cases. On the server, recompute distance to the nearest Office with the haversine formula in `src/lib/geo.ts` (never trust a client-computed distance). Rules by work mode: Office staff outside every geofence are recorded with flag OUTSIDE_GEOFENCE and shown to their manager; Hybrid and Remote staff are recorded as Remote. Reject readings with accuracy worse than 150 m and ask the user to retry outdoors. Build Settings > Offices to add and edit offices with a map pin preview. Make the app installable as a PWA.

**Checks**

- On a phone over HTTPS, a punch inside the office radius records the office and distance
- A punch 5 km away by an office-based employee is flagged and appears on Team overview
- Unit tests cover haversine distance and the work-mode rules

## Phase 5. Face punch

**Prompt**

> Phase 5. Add face ID using @vladmandic/face-api in the browser with TinyFaceDetector, 68-point tiny landmarks and the recognition net, served from /public/models. Enrolment on My profile: show a consent notice (what is stored, why, retention, how to withdraw), record consent, capture up to 3 samples from the live camera, store only the 128-number descriptors in FaceTemplate, encrypted with AES-GCM using FACE_TEMPLATE_KEY. Punch: capture a frame, compute the descriptor on the device, send it to the server, and match on the server against the stored template (Euclidean distance, threshold from settings, default 0.5). Reject frames with zero or several faces. Add a simple liveness step: ask the user to turn their head left then right and check landmark movement across frames. Record faceScore with the punch and take GPS in the same step. Let employees withdraw consent, which deletes their template. Add rate limiting of 5 failed matches per 10 minutes.

**Checks**

- Enrol and punch work on Android Chrome and iPhone Safari
- A different person's face is rejected at the default threshold in at least 20 tries
- Withdrawing consent deletes the template and blocks face punch
- No image is ever sent to or stored on the server (check network requests)

## Phase 6. Office kiosk code

**Prompt**

> Phase 6. Add a kiosk screen at /kiosk/[deviceId] for a reception tablet. It shows a 6-digit code that changes every 30 seconds, generated with TOTP (RFC 6238) from the KioskDevice secret. Employees enter the code on the Punch page; the server accepts the current or previous window only, and records method KIOSK with the device's office location. Kiosk devices are registered by Super Admin and can be revoked. Put the TOTP helper in `src/lib/kiosk.ts` with unit tests.

**Checks**

- An expired code is rejected; the current code works
- Revoking a device stops its codes working at once

## Phase 7. Leave and holidays

**Prompt**

> Phase 7. Build leave: LeaveType admin (annual days, carry forward), yearly LeaveBalance with accrual and carry forward run by a 1 January cron job, Apply for leave (working days exclude weekends and holidays, overlap check, available = balance minus pending), cancel while pending, approval by the employee's manager or anyone with leave.approve_all, never by the requester. Approval deducts the balance in the same transaction. Build the Holidays page with per-office holidays. Unit-test day counting, overlap, balance and carry forward.

**Checks**

- A request spanning a weekend and a holiday counts only working days
- Approving a request that exceeds the balance is blocked
- The yearly job carries forward at most the configured days

## Phase 8. Corrections, approvals inbox and notifications

**Prompt**

> Phase 8. Add Regularisation requests from My attendance for absent days or missing check-outs. Build one Approvals inbox listing leave, corrections and expense claims the user may decide, with approve and reject (reject needs a reason). Approved corrections write punches with method REGULARISED and rebuild the AttendanceDay. Send email notifications on submit and decision using a transactional email provider, with links back to the item. Add an unread count badge in the sidebar.

**Checks**

- A manager sees only their direct reports' items; HR Admin sees everyone's
- Approving a correction changes the day's status from Absent to Present

## Phase 9. Expense claims

**Prompt**

> Phase 9. Build expense claims: submit with category, date, amount in paise, note and a receipt upload (image or PDF, up to 10 MB, stored in object storage with signed URLs). Flow: Pending to Approved by manager, then Reimbursed by Finance, or Rejected with a reason. Add a Finance view with totals by status and a CSV export.

**Checks**

- Receipts are only viewable by the claimant, their manager, Finance and admins
- Totals on the Finance view match the database

## Phase 10. Reports, executive dashboard and payroll preview

**Prompt**

> Phase 10. Build the Executive dashboard (headcount, in today, remote today, open requests, monthly payroll cost, claims this month, attendance rate for the last 15 working days as a bar chart, department table, punch method mix) and Reports (headcount by department, leave approved by type, attendance rate and late days by department, expenses by category). Build the Payroll preview: monthly gross from CTC, working days, loss-of-pay days from AttendanceDay, net before statutory deductions, and a printable payslip preview. Label it clearly as a preview. Write unit tests for the payroll maths.

**Checks**

- Dashboard numbers match SQL queries run by hand on the seed data
- Payslip LOP equals absent working days for a test employee

## Phase 11. Google Sheets backup and audit log

**Prompt**

> Phase 11. Add a nightly Google Sheets backup using a Google service account with the Sheets API. Write one tab per table (Employees, Attendance, Leave, LeaveBalances, Regularisation, Expenses, Holidays, Announcements, Roles, AuditLog), clearing each tab first. Never export face templates or secrets. Add a "Sync now" button for users with sheets.sync, showing per-tab results. Build the Audit log screen with filters by person, action and date.

**Checks**

- The sheet matches the database row counts after a sync
- A failed sync shows which tab failed and why

## Phase 12. Hardening, privacy and launch readiness

**Prompt**

> Phase 12. Security and privacy pass: add rate limits on sign-in and punch routes, CSRF protection on mutations, strict security headers, and input validation everywhere with Zod. Add a privacy notice page and consent records for face and location data, a retention job that deletes punches' precise coordinates after the retention period set in settings (keep distance and office), and an export of a person's own data. Add database backups and a restore drill. Write e2e tests for the main journeys of every role. Fix every lint, type and test failure.

**Checks**

- All e2e journeys pass in CI
- A restore drill on a copy of the database succeeds
- Privacy notice and consent records exist for every enrolled face template

## Phase 13. Pilot, then integrations

**Prompt**

> Phase 13. Prepare the pilot: import real employees from a CSV template (validate and show errors before import), set real office coordinates, and add a feature flag per office to turn on face and GPS punches. Then, if the directors approve, plan biometric device integration: devices push punches to an authenticated webhook that writes Punch rows with method DEVICE. Do not build device integration until a device model is chosen.

**Checks**

- A pilot team of 10 to 15 people uses the system for two weeks with daily Sheets backups
- Issues from the pilot are logged and fixed before company-wide rollout

---

## How to run each session with Claude Code

1. Start with: "Read CLAUDE.md and HRMS_BUILD_PLAN.md. We are on Phase N."
2. Ask Claude Code to propose its plan for the phase first, approve it, then let it build.
3. Ask it to run lint, typecheck and tests, and to show you the checks for the phase.
4. Review the diff, merge, and tag the phase (for example `phase-3`).
