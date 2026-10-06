# Credit Repair Desk

A local app for running credit repair files for multiple clients. Upload a credit report, and a Claude-powered
consumer-law agent identifies every negative, inaccurate, or unverified account, the FCRA/FDCPA sections that
apply, the strongest dispute angle, and the next steps. Track each item through to deletion and download every
dispute letter or affidavit as PDF or Word.

## Setup

1. Create `.env.local` in this folder (see `.env.example`):

   ```
   ANTHROPIC_API_KEY=your-key
   ```

   Get a key at https://console.anthropic.com.

2. Start the app and open http://localhost:3000:

   ```bash
   npm run dev
   ```

The first time you open the app it asks you to create the specialist account — the one login that manages every
client.

## Password resets

- **Self-service:** "Forgot your password?" on the sign-in page emails a one-hour, single-use link (needs email
  configured; set `APP_URL` to your public address so links are correct behind a proxy).
- **By an admin:** Accounts → "Reset link" next to any other account makes the same link to hand over by any channel.
- **Locked out entirely:** `npm run reset-link -- you@example.com` on the server prints a reset path.

A reset signs the account out everywhere else.

## Admin dashboard and accounts

Admins land on the **Dashboard**: totals across every client, a "needs attention" worklist (overdue replies,
verified items, unsent drafts, failed reports), and where every item sits in the pipeline. **Accounts** (top
right) lists who can sign in, lets you add or remove admins, remove client logins, and change your password.

## Credit scores and progress

Scores printed on an uploaded report are recorded automatically when it is analyzed; you or the client can also
type in readings from a bank or monitoring app. Each client's Overview (and their portal) shows the latest score
per bureau, the change since the first reading on file, and a history line. The admin dashboard shows the average
change across all clients.

## Step-by-step guidance

Each client's file opens with **Where this file stands**: the eight steps from completing their details to
resolving every item, with the current step and a button that takes you to it. Clients see their own six-step
**Your steps** tracker in the portal, and confirm each letter with **I mailed this**, which starts its 30-day
clock for you. The step logic lives in `src/lib/steps.ts`.

## Sending letters by certified mail

Letters can be mailed from the app through [Lob](https://www.lob.com) as USPS Certified Mail.

1. Add `LOB_API_KEY` to `.env.local`. A `test_` key checks every send without mailing or billing; a `live_` key
   prints and mails real letters and bills your Lob account.
2. The client saves a signature in their portal and presses **Approve & sign** on each letter. The signature is
   only placed on text they approved; editing a letter afterwards removes the approval.
3. On the Letters tab, **Send certified mail** shows the parsed address and page count, then sends on confirm.
   The tracking number and delivery date come back automatically, and the 30-day clock runs from delivery.

For instant tracking updates, create a webhook in the Lob dashboard pointing at `https://your-host/api/webhooks/lob`,
subscribed to the `letter.certified.*` events, and put its secret in `.env.local` as `LOB_WEBHOOK_SECRET`. Every call
is checked against that secret (HMAC-SHA256 of `timestamp.body`, 5-minute tolerance) and the letter's status is
re-read from Lob rather than trusted from the payload. Without a webhook the app still checks every 30 minutes.

`MAIL_PROVIDER=demo` simulates all of this (delivery in about two minutes) without an account. Identity-theft
affidavits (notary required) and CFPB narratives (filed online) are never mailed from the app. The mail code is in
`src/lib/mail.ts`, behind a small provider interface so another service such as Click2Mail can be added.

## Email notifications

When a certified letter is confirmed delivered, the client and every admin receive an email with the delivery date
and the 30-day reply deadline. Set `MAIL_FROM` plus either `RESEND_API_KEY` ([resend.com](https://resend.com)) or
`SMTP_URL` (any mail server, e.g. `smtps://user:password@smtp.example.com:465`) in `.env.local`. A background check
runs every 30 minutes while the app is up (every 20 seconds in mail demo mode), so emails go out even when nobody
has the app open. `EMAIL_PROVIDER=demo` logs the emails on the Accounts page instead of sending them.

## Client logins

On a client's Overview tab, **Client login → Create invite link** gives you a one-time link (valid 7 days) to send
them. They choose their own password and land on a portal showing only their own file: they can upload credit
reports, follow progress, and download finished letters. Drafting, editing, statuses, notes, freezes, and the
advisor stay with you. Remove a login from the same card.

Clients can only reach the portal if the app is hosted somewhere they can get to. Run it on a server with HTTPS
and a persistent disk for `data/` (`npm run build && npm start`) — a VPS or Railway with a volume works; serverless
hosts like Vercel do not, because the database is a local file.

## Demo account

```bash
npm run demo
```

creates a fictional client, Jordan Demo, with a full sample file (seven items at different stages, sent and
draft letters, deadlines, freezes) and a demo portal login. If no specialist account exists yet it also creates
a demo specialist login. The credentials are printed by the command and defined at the top of `scripts/demo.mjs`.
Run `npm run demo:remove` to delete it all — do this before hosting the app for real clients.

## Workflow

1. **Add a client** — name, mailing address, date of birth, last 4 of SSN (printed on bureau letters only).
2. **Upload their credit report** (PDF, TXT, or HTML). Analysis runs in the background.
3. **Negative items** — review each item's issues, laws, dispute angle, and next steps. Add notes the agent
   should use, set statuses as results come in.
4. **Letters** — pick a letter type, the items, and all bureaus or one at a time. Types cover round-one
   disputes, debt validation, direct furnisher disputes, inquiry and personal-info challenges, follow-ups
   (method of verification, no response), escalation (final notice, CFPB complaint), and an identity-theft
   affidavit. Edit, download (single or all as a ZIP), mark sent, and record the outcome.
5. **Freezes** — checklist and mail-in letters for LexisNexis, Innovis, ChexSystems, and other secondary agencies.
6. **Advisor** — ask the agent questions about the client's file.

## Deploying

The app is a single Node server with a SQLite database and uploaded files under `data/`, so it needs one always-on
instance with a persistent disk: a small VPS, or Railway/Render/Fly with a volume mounted at `data/`. Serverless
hosts (Vercel, Netlify) will not work. Node 24 or newer is required (`node:sqlite`).

1. `npm ci && npm run build`, then `npm start` (binds to `$PORT`). Set `NODE_ENV=production` so session cookies are
   HTTPS-only, and put the app behind HTTPS.
2. Environment: `ANTHROPIC_API_KEY`, and for mail/email `LOB_API_KEY`, `MAIL_FROM` + `RESEND_API_KEY` or `SMTP_URL`,
   optionally `LOB_WEBHOOK_SECRET`. Leave out `MAIL_PROVIDER=demo` / `EMAIL_PROVIDER=demo`.
3. First visit: create your admin account at `/setup`. Don't ship the demo data — run `npm run demo:remove` first,
   or start from an empty `data/`.
4. Back up `data/` regularly (it holds client PII, signatures and uploaded reports) and keep the disk encrypted.
5. Run exactly one instance: login throttling and the tracking checker live in process memory, and SQLite is a
   local file.

### Railway

`railway.json` and `nixpacks.toml` are included. In the Railway service: add a **Volume** mounted at `/app/data`,
set the environment variables above (plus `APP_URL=https://<your-railway-domain>`), and generate a public domain.
The health check hits `/api/health`.

## Where things live

- `data/` — SQLite database and uploaded reports. Local only and git-ignored. Back it up; it holds client PII.
- `src/lib/auth.ts` — passwords (scrypt), sessions, and the permission checks used by every API route.
- `src/lib/agent.ts` — the agent's instructions, analysis schema, and letter briefs.
- `src/lib/agencies.ts` — bureau and secondary-agency mailing addresses.
- `src/lib/letterDoc.ts` — PDF / Word layout.

Uploaded reports are sent to the Anthropic API for analysis. Nothing else leaves this machine.
