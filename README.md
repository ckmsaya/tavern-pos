# TillFlow — Tavern Point of Sale

A point-of-sale and back-office dashboard built for a single tavern: staff
ring up sales from a touch-friendly POS screen, an owner dashboard tracks
revenue/profit/stock/staff activity in real time, and a PDF summary of the
day's business is emailed automatically every night. It's an installable,
offline-capable PWA, and can drive a real USB receipt printer and cash
drawer through a small local helper program.

The repo is named `tavern-pos`; the product itself is branded **TillFlow**
(see the header/logo in the app and on printed receipts).

## Contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Roles, sessions, and authentication](#roles-sessions-and-authentication)
- [API reference](#api-reference)
- [Security model](#security-model)
- [Daily report email](#daily-report-email)
- [In-store hardware (printer / cash drawer)](#in-store-hardware-printer--cash-drawer)
- [Scripts](#scripts)
- [Deployment](#deployment)

## Architecture

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Browser (PWA)       │        │  print-helper (Node/exe)  │
│  /login  /pos  /dashboard │──▶ │  http://localhost:7777    │──▶ USB receipt
│                       │  HTTP  │  (runs on the till PC)    │    printer +
└──────────┬───────────┘        └──────────────────────────┘    cash drawer
           │ HTTPS
           ▼
┌─────────────────────┐        ┌──────────────────────────┐
│  Next.js app router   │──────▶│  Supabase (Postgres)      │
│  app/api/* routes     │service│  RLS-locked; only the      │
│  (Vercel)              │ role  │  service-role key can read/│
└──────────┬───────────┘        │  write, via these routes  │
           │                    └──────────────────────────┘
           │ (Vercel Cron, once daily)
           ▼
┌─────────────────────┐
│  Gmail (nodemailer)   │──▶ owner's inbox: PDF daily report
└─────────────────────┘
```

- **Web app** — Next.js (App Router), deployed to Vercel. All pages are
  client components; all data access goes through `app/api/*` route
  handlers, never directly from the browser to Supabase.
- **Database** — Supabase Postgres. Row Level Security is enabled on every
  table with no policies for `anon`/`authenticated`, so RLS denies direct
  access by default — the API routes (using the service-role key) are the
  only path in. See [`supabase/schema.sql`](supabase/schema.sql).
- **print-helper** — a standalone Node/Express service (also shippable as a
  Windows `.exe`) that runs on the physical till PC and is the only thing
  allowed to talk to the USB receipt printer / cash drawer, since browsers
  can't do that directly. See
  [`print-helper/README.md`](print-helper/README.md).
- **Daily report** — a Vercel Cron job hits `/api/cron/daily-report` once a
  day, which builds a PDF (via `pdfkit`) from that day's sales/stock/staff
  data and emails it through Gmail (via `nodemailer`).

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, `proxy.ts` middleware) + React 19
- [Supabase](https://supabase.com) (Postgres, Row Level Security, `pgcrypto` for PIN hashing)
- [pdfkit](https://pdfkit.org) for the daily report PDF, [Chart.js](https://www.chartjs.org) for dashboard charts
- [nodemailer](https://nodemailer.com) (Gmail) for report delivery
- A separate Node/Express service (`print-helper/`) for ESC/POS printer + cash-drawer control
- PWA (installable, offline-capable) via `app/manifest.ts` + `public/sw.js`

## Repository layout

```
app/
  api/                One route handler per endpoint — see API reference below
  login/  pos/  dashboard/   The three screens (PIN login, till, owner dashboard)
  manifest.ts, pwa-register.tsx, layout.tsx   PWA shell
lib/
  api-security.ts      Rate limiting, session validation, request parsing helpers
  server-supabase.ts   Service-role Supabase client factory
  daily-report-pdf.ts  PDF report builder (pdfkit)
  report-data.ts       Aggregates today's sales/stock/staff into report shape
  staff-sessions.ts    Per-staff clock-in/out + performance aggregation
  gmail.ts             Sends the daily report PDF via Gmail
proxy.ts                Next.js middleware — redirects based on session presence
supabase/schema.sql     Full DB schema, RLS policies, PIN-hashing RPCs
print-helper/           Standalone service for the physical printer/cash drawer
script/generate_report.py  Reference/legacy standalone PDF generator (Python, reportlab) — not part of the running app
```

## Getting started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is enough)
- A Gmail account with an [App Password](https://myaccount.google.com/apppasswords) generated, if you want the daily email report

### 1. Install

```bash
npm install
```

### 2. Set up the database

In the Supabase SQL editor, run [`supabase/schema.sql`](supabase/schema.sql)
in full. It creates every table, enables RLS, and installs two
`security definer` RPCs (`verify_staff_pin`, `hash_staff_pin`) that are
locked to `service_role` only — the app never reads or writes a raw PIN.

Create your first owner account (PINs are hashed with bcrypt via
`pgcrypto`, never stored or compared in plaintext):

```sql
insert into staff (name, role, hashed_pin)
values ('Owner', 'owner', crypt('1234', gen_salt('bf')));
```

Change `'1234'` to a real PIN before using this anywhere but a local test
database.

### 3. Configure environment variables

Copy the template and fill in real values:

```bash
cp .env.example .env.local
```

See [Environment variables](#environment-variables) below for what each
one does.

### 4. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to
`/login`. Log in with the PIN you created above.

### 5. (Optional) Receipt printer / cash drawer

Not needed to use the app — without it, sales still record normally, just
without a physical receipt. See
[`print-helper/README.md`](print-helper/README.md) to wire up real
hardware.

### 6. (Optional) Daily email report

Requires `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `CRON_SECRET` to be set.
On Vercel, the cron schedule in [`vercel.json`](vercel.json) triggers it
automatically once a day. To test it manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-report
```

## Environment variables

All of these are read via `getRequiredEnv()`/`process.env` in
[`lib/api-security.ts`](lib/api-security.ts) and friends — the app throws a
clear error at request time if a required one is missing, rather than
failing silently. See [`.env.example`](.env.example) for the template.

| Variable | Required | Used for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase key that bypasses RLS. **Never** expose this to the browser — it's only ever read in `app/api/*` route handlers and `lib/`, which run server-side. |
| `GMAIL_USER` | For email reports | Gmail address the daily report is sent from |
| `GMAIL_APP_PASSWORD` | For email reports | Gmail [App Password](https://myaccount.google.com/apppasswords) (not your regular Gmail password) |
| `REPORT_TO_EMAIL` | No | Where the daily report is sent; defaults to `GMAIL_USER` |
| `CRON_SECRET` | For the cron route | Bearer token that `/api/cron/daily-report` requires, so only Vercel's cron invoker (or someone who knows the secret) can trigger it |

`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are high-value secrets — set
them in your hosting provider's environment variable settings (e.g. Vercel
Project Settings → Environment Variables), never commit them. `.env*` is
gitignored (with an explicit exception for the empty `.env.example`
template) for exactly this reason.

## Roles, sessions, and authentication

There are two roles: **staff** (rings up sales, can only undo their own
sales, can submit a blind cash count) and **owner** (everything staff can
do, plus managing products/staff, reviewing cash counts, resetting the day,
and pulling reports).

Login (`POST /api/login`) takes a 4–12 digit PIN, checks it against the
`staff` table via the `verify_staff_pin` RPC (bcrypt comparison done
entirely inside Postgres — the plaintext PIN is never stored or logged),
and on success:

1. Generates a random 256-bit session token (`crypto.randomBytes(32)`).
2. Inserts a row into `staff_sessions` mapping that token to the staff
   member's name.
3. Sets it as a single `httpOnly`, `secure` (in production), `sameSite=lax`
   cookie named `session_token` — the browser never sees the staff member's
   name or role directly, only this opaque token.

Every route that needs to know who's calling (`requireStaffSession` /
`requireOwner` in `lib/api-security.ts`) resolves that token back to a
`staff_sessions` row and then to the staff member's *current* role from the
`staff` table — so a role change or removal takes effect immediately, and
there's nothing client-controlled for a request to forge its way past.
`proxy.ts` (Next.js middleware) only checks whether the cookie is present,
for redirect UX (e.g. bouncing a logged-out visitor to `/login`); it is not
the security boundary — the API routes are.

## API reference

All routes live under `app/api/`. "Owner" means `requireOwner()`; "Staff"
means `requireStaffSession()` (owner also satisfies this). Every route is
rate-limited per client IP (see `rateLimit()` in `lib/api-security.ts`);
limits are tightest on destructive/bulk actions.

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/login` | Public (rate-limited: 5 / 5 min) | PIN login, issues session cookie |
| `POST /api/logout` | Any | Ends the current session |
| `GET /api/me` | Staff | Current identity + active login time |
| `GET /api/products` | Staff | List products (optional `barcode`/`businessId` filter) |
| `POST /api/products` | Owner | Create a product |
| `DELETE /api/products/[id]` | Owner | Remove a product |
| `POST /api/products/[id]/restock` | Owner | Adjust stock by a signed delta |
| `GET /api/sales` | Staff | List sales (non-owners see only their own) |
| `POST /api/sales` | Staff | Record a sale, decrements stock |
| `POST /api/sales/undo` | Staff | Undo sale(s) by id — staff can only undo their own; all undos are audit-logged |
| `GET /api/undo-log` / `DELETE /api/undo-log` | Owner | View / clear the undo audit trail |
| `GET /api/cash-counts` / `DELETE /api/cash-counts` | Owner | View / clear submitted cash counts |
| `POST /api/cash-counts` | Staff | Submit a blind end-of-shift cash count |
| `POST /api/cash-counts/[id]/review` | Owner | Reconcile a cash count against the till |
| `GET /api/staff` / `POST /api/staff` | Owner | List / create staff members |
| `DELETE /api/staff/[id]` | Owner | Remove a staff member (blocked if they're the last owner) |
| `POST /api/staff/[id]/pin` | Owner | Reset a staff member's PIN |
| `GET /api/staff-sessions` / `DELETE /api/staff-sessions` | Owner | Clock-in/out report / clear it |
| `POST /api/reset-day` | Owner | Wipe today's sales and reset opening stock |
| `POST /api/daily-report` | Owner | Generate the daily PDF report on demand (browser download) |
| `GET /api/cron/daily-report` | Bearer `CRON_SECRET` | Emails the daily PDF report; called by Vercel Cron once a day |

## Security model

- **No plaintext PINs, ever.** PINs are hashed with bcrypt (`pgcrypto`'s
  `crypt()`) inside two `security definer` Postgres functions
  (`verify_staff_pin`, `hash_staff_pin`) that are revoked from `anon` and
  `authenticated` and granted only to `service_role` — so a PIN can't be
  brute-forced directly against Supabase's REST API even if someone had the
  anon key, only through the app's own rate-limited login route.
- **Row Level Security everywhere.** Every table has RLS enabled with no
  policies for `anon`/`authenticated`; the only way in is the server-side
  `service_role` key, used exclusively from `app/api/*` route handlers.
- **Opaque, server-validated sessions** — see [above](#roles-sessions-and-authentication).
  Nothing about a request's identity is trusted from client input.
- **Rate limiting** on every route, scoped per client IP + endpoint (see
  the table above), tightest on login and destructive/bulk operations
  (reset-day, clear-log endpoints).
- **Input validation** on every route: UUIDs and numeric ids are format
  checked before use, request bodies have size caps
  (`parseJsonBody(req, maxBytes)`), free-text fields are length-capped, and
  enums (category, payment method, cash-count status) are validated against
  an allowlist rather than trusted as-is.
- **Security headers** set globally in `next.config.ts`:
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a
  `Permissions-Policy` that blocks camera/microphone/geolocation.
- **print-helper is intentionally unauthenticated but origin-restricted.**
  It has to accept plain HTTP requests from the browser tab running the POS
  (no way to attach an API token from a `<script>` fetch to a local printer
  service), so the only thing standing between "the POS opens the drawer"
  and "any website open in another tab opens the drawer" is CORS —
  `allowedOrigins` in `print-helper/config.json` must be set to the POS's
  actual URL(s), never `"*"`. See
  [`print-helper/README.md`](print-helper/README.md).

## Daily report email

`GET /api/cron/daily-report` (protected by `CRON_SECRET`) aggregates the
day's revenue, cash/card split, profit, staff performance, stock levels,
cash-count reconciliations, and the undo audit log
(`lib/report-data.ts`), renders it as a PDF (`lib/daily-report-pdf.ts`),
and emails it via Gmail (`lib/gmail.ts`) to `REPORT_TO_EMAIL` (or
`GMAIL_USER` if unset). The schedule lives in [`vercel.json`](vercel.json)
(`0 21 * * *` — 21:00 UTC by default; adjust for your timezone). An owner
can also pull the same PDF on demand from the dashboard via
`POST /api/daily-report`.

`script/generate_report.py` is a standalone Python/reportlab report
generator kept for reference — it is not called by the running app
(`lib/daily-report-pdf.ts` is the one actually used).

## In-store hardware (printer / cash drawer)

The POS can print ESC/POS receipts and kick a cash drawer on a real USB
thermal printer, via a small local helper service — full setup (driver
install, config, auto-start on boot) is in
[`print-helper/README.md`](print-helper/README.md). Barcode scanning needs
no setup: any standard keyboard-wedge USB/Bluetooth scanner works out of
the box, since it just types into the barcode field like a keyboard.

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run start   # run the production build
npm run lint    # eslint
```

`print-helper/` has its own `package.json` with `npm start` (run from
source) and `npm run build:exe` (bundle to a standalone Windows `.exe` via
`pkg`) — see its README for details.

## Deployment

The web app deploys to [Vercel](https://vercel.com) like any Next.js app:
push to your connected repo, set the [environment variables](#environment-variables)
in Project Settings, and Vercel picks up the cron schedule from
`vercel.json` automatically. `print-helper` does **not** run on Vercel — it
runs locally on the till PC, since that's the only machine with the USB
printer attached.
