# Staff Tools Architecture

Last updated: 2026-07-23. This is the map for the staff-facing web tools + their
backend, so a future session (or future บอสตอง) doesn't have to reverse-engineer
it from scratch.

## The three staff-facing pages

All hosted on Netlify at `nawingroup.com`, source in this repo.

| Page | URL path | Purpose | Auth |
|---|---|---|---|
| Hotel check-in | `/staff-checkin/` | Reception/housekeeping clock in/out | per-staff token `?k=` |
| Hotel cash report | `/cash-report/` | Reception logs cash collected at shift close | per-staff token `?k=` |
| Squid sales report | `/squid-sales-report/` | Squid-grill staff report daily sales by branch | shared token `?k=` (no per-staff table yet — see Gaps) |

Each page is a static HTML file with inline JS, no build step. They call
Supabase Edge Functions directly via `fetch()`.

## Auth model: per-staff tokens (hotel only)

As of 2026-07-23, `hotel_staff.access_token` holds one unique token per active
staff member. **The token IS the identity** — the client never sends a
`staff_id`; the edge function looks up who's calling by their token. This
means:

- Each staff member gets their **own personal link** (not one shared link for
  everyone) — e.g. `nawingroup.com/staff-checkin/?k=<their-token>`.
- Revoking one person's access = clear their `access_token` in `hotel_staff`.
  Nobody else's link is affected.
- To onboard a new hotel staff member: insert their `hotel_staff` row, set
  `access_token` to a fresh random value (`python3 -c "import secrets; print(secrets.token_hex(12))"`),
  send them their personal `staff-checkin` and `cash-report` links.

Squid sales still uses the old model (one shared token + free-text staff
name typed into the form each time) because there's no `squid_staff` table
yet — see **Gaps** below.

## Supabase backend

Project: `bosstong-finance` (id `hkglavlxhdtoawjfptah`, region ap-southeast-1).

**Tables involved:**
- `hotel_staff` — id, name, role, base_salary, hire_date, probation_months,
  social_security_active, access_token, active, assume_present_by_default
- `hotel_attendance` — staff_id, attendance_date, status, checkin_at, checkout_at, ot_flag
- `hotel_shift_cash_log` — staff_id, shift_date, room_cash, fine_cash, is_backdated
- `hotel_payroll` — computed payslips, one row per staff per period
- `transactions` — universal ledger across all businesses (hotel/squid/nabee/investment/personal)

**Edge functions (public, token-gated, no IP restriction):**
- `public-hotel-checkin` — GET `?action=me&k=` returns caller's own info; POST `{k, status}` clocks in/out
- `public-hotel-cash-log` — POST `{k, date, room_cash, fine_cash}` logs shift cash + creates matching `transactions` rows
- `public-squid-sales-report` — POST `{k, branch, staff_name, date, cash, transfer, thai_qr}`; resubmitting the same date+branch **replaces** the prior entry rather than stacking a duplicate

**Edge functions (internal, `x-internal-secret` header, called by Hermes scripts only):**
- `get-hotel-staff`, `get-hotel-attendance`, `save-hotel-payroll`, `save-transaction`, `get-transactions`, etc.

**Vault secrets** (names only — see Supabase Studio for values):
- `hotel_checkin_token` — legacy shared token, no longer read by any hotel function (kept for `public-nabee-checkin`, a separate system)
- `squid_sales_token` — shared token for squid-sales-report
- `internal_functions_secret` — auth for internal (Hermes-only) edge functions

## Payroll

`.hermes/scripts/run_payroll.py` computes one staff member's monthly payslip
from `hotel_attendance`. Two models, selected by role:

- **Reception staff** (`role` starts with `reception`): 26-day/month
  threshold policy (full rule recorded in Claude Code's memory as
  `project_hotel_reception_payroll_policy`, outside this repo). Worked days < 26 → absence deduction for the shortfall.
  Worked days > 26 → 500 THB/day OT. A record spanning both shifts
  back-to-back only counts as 2 workdays if a human has explicitly set
  `ot_flag=true` on it — duration alone is never trusted, because a long
  gap between checkin/checkout is just as likely to be a system-outage
  artifact (this happened for real on 2026-07-20/21) as a genuine covered
  shift.
- **Everyone else** (e.g. housekeeping): the original present/leave/absent +
  explicit `ot_flag` model.

Always run with `--period <finished month>`; the script refuses to run
mid-month (except with `--dry-run`, which also skips the "period must be
finished" guard so you can preview numbers any time).

## Monitoring

Three lightweight watchdogs, all `hermes cron` jobs running `--no-agent
--script` (no LLM cost, silent when healthy, alert via LINE when not):

| Watchdog | Interval | Checks |
|---|---|---|
| Webhook Health Watchdog | 15 min | LINE inbound webhook actually reachable end-to-end |
| Cron Job Health Watchdog | 30 min | Any enabled cron job whose last run didn't succeed |
| Staff Tools Health Watchdog | 30 min | The 3 staff pages + a live hotel-checkin API round-trip |

Scripts live in `.hermes/scripts/check_*.py`.

## Rich Menu / LIFF

`bosstong_hermes` LINE OA has a 6-button main menu (บอสตอง's own quick
actions) — one button opens the squid-sales LIFF form directly. Squid staff
who add the OA would see the *same* 6-button menu by default unless linked
to the separate compact single-button squid menu via
`.hermes/scripts/link_staff_richmenu.py <userId>` (LINE has no way to tell
staff apart from บอสตอง automatically — this has to be done once per person,
manually, after they add the OA and send a first message).

## Known gaps / follow-ups

1. **No `squid_staff` table** — sales are reported with a free-text name
   field, no per-person token, no way to revoke one squid employee's access
   without rotating the link for everyone. Same fix pattern as hotel is
   ready to apply once real staff names/branches are confirmed.
2. **No staging environment** — every edge function change goes straight to
   production. Supabase branching (`create_branch`) is available and unused.
3. **Hermes and Claude Code memory are separate** — policy/architecture
   knowledge captured in one doesn't automatically reach the other.
