# HRMS prototype plan

Nov 24, 2026 · @Shubham Thakkar

We will build a clickable HRMS prototype first, backed by Google Sheets, so directors can see and test it before any server or biometric decision is made.

## Prototype scope

The prototype now runs on live shared data with 8 demo profiles across 7 roles, and each person sees only what their role allows.

| Module | What works in the prototype |
| --- | --- |
| Logins and roles | Super Admin, Director, HR Admin, HR Executive, Finance, Manager and Employee. People can hold several roles and switch. Super Admin edits the permission matrix |
| Employee records | Add, edit, deactivate, assign roles, directory, org chart |
| Attendance | Face punch, GPS geofence punch, office kiosk code, quick web punch, correction requests, HR fixes |
| Leave | Apply, approve, balances, holiday calendar |
| Expenses | Claim, manager approval, Finance reimbursement |
| Leadership | Executive dashboard, reports, payroll preview, audit log |
| Data | Live shared database, one-click sync to the Google Sheet |

## Data layer on Google Sheets

One Google Sheet holds the prototype data, with one tab per table, so HR can open any record directly. The prototype keeps its live data in a shared database, and HR or Super Admin syncs every tab to the Sheet with one click.

| Tab | Key columns |
| --- | --- |
| Employees | Emp ID, name, email, department, designation, manager ID, join date, status |
| Users | Login email, role (HR, Manager or Employee), Emp ID |
| Attendance | Emp ID, date, check-in, check-out, hours, status |
| Leave types | Type, annual days, carry forward |
| Leave requests | Request ID, Emp ID, leave type, from, to, days, reason, status, approver |
| Leave balances | Emp ID, leave type, used, remaining |

The same tab structure can later move to a real database, so the move is a data copy rather than a redesign. Sheets is suitable for the demo only, not for live use by many people or for private passwords.

## Build phases

The prototype comes first, and the full build waits for the directors' decision. Durations are rough estimates for a small team.

| Phase | What happens | Output | Estimate |
| --- | --- | --- | --- |
| 1. Prototype | Three logins, leave, attendance, employee records, sample data, Sheets export | Clickable demo for directors | About 1 week |
| 2. HR pilot | HR tests with a sanitised staff list and gives feedback on policies | Revised rules and fields | About 2 weeks |
| 3. Decision | Directors choose to build in-house, buy a tool, or stop | Go or no-go | Director review |
| 4. Full build | Real database, secure logins, approval notifications, mobile-friendly screens | Live system for a pilot team | To scope after decision |
| 5. Integrations | Biometric devices, payroll, hosting | Connected system | Later, separate plan |

The full build is broken into 14 smaller phases in a separate step-by-step plan written for Claude Code, each with its own checks.

## Deferred decisions

Four questions stay open until the directors approve the build.

- [ ] Hosting: which cloud, what it costs, and where Indian employee data is stored
- [ ] Backend: which database and API the full product uses in place of Sheets
- [ ] Biometric devices: optional now, since face punch, GPS geofencing and the kiosk code cover most cases
- [ ] Payroll: integrate with a payroll provider or keep it separate

## Branding

The prototype uses Silver Touch branding only, and it runs on placeholder colours until the brand sheet is confirmed. Public pages for Silver Touch Technologies give no colour codes, so these must come from the brand guidelines.

- [ ] Logo file, preferably SVG or PNG with a transparent background
- [ ] Primary and accent colour codes
- [ ] Typeface used in Silver Touch materials
