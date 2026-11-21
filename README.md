# LabFix: Computer Lab Maintenance System

Report broken lab computers, track repairs, and contact the maintenance company in one click.

**Stack:** React 19 · TypeScript · Tailwind CSS v4 · Firebase (Auth + Firestore) · Vite

## Features

| Who | Can do |
|---|---|
| **Staff / lecturers** | Report a faulty PC (lab → PC → problem type → priority), follow the ticket live, add comments |
| **Admin (lab in-charge)** | Everything staff can do, plus **📞 Call maintenance company**, change ticket status, manage computers, maintenance companies and user roles |

**Call maintenance company** (on each ticket):
- **Call**: opens the phone dialer (`tel:`) on mobile or a softphone app.
- **WhatsApp**: opens WhatsApp with the repair request already written (ticket code, PC, lab, problem, priority).
- **Email**: queues an email in the `mail` collection. The [Trigger Email from Firestore](https://extensions.dev/extensions/firebase/firestore-send-email) extension sends it. There's also a `mailto:` fallback.
- Every contact is logged on the ticket timeline, the company is assigned to the ticket, and the status moves to **Vendor Called**.

**Ticket flow:** `Open → Vendor Called → In Progress → Resolved → Closed`. The PC's status follows along automatically (Faulty → Under Repair → Working).

## Demo data & reports

- **Reports** (sidebar) shows:
  - Totals: tickets reported, resolution rate, average time to fix, and vendor call-outs.
  - A reported-vs-resolved trend chart, with a table view.
  - Breakdowns by problem type and by lab.
  - Average fix time by priority.
  - Computers with repeat problems.
  - Each maintenance company's performance.

  You can filter by 30 days, 90 days, 12 months or all time, and use **Export CSV** to download the tickets.
- **Load demo data** (admins, on the Reports page) adds 4 labs, 63 PCs, 3 maintenance companies and 84 tickets with full timelines spread over ~6 months. Every demo record is tagged `demo: true`. **Remove demo data** deletes only those records.

## Maintenance company portal

1. An admin opens a ticket and clicks **Call maintenance company**. The WhatsApp/email message automatically includes that company's **portal link** (`/join/<code>?ticket=<id>`).
2. The technician opens the link and signs up once (email or Google). The account is registered as a **technician of that company**. The security rules only allow this with a valid invite code for that exact company.
3. Technicians see **only their company's jobs**: PC, lab, problem type, priority, details and timeline. They can **Start repair**, **Mark as fixed** (with a note) and comment. The lab sees every update live.
4. Admins manage links on **Maintenance Co.**:
   - Show or copy the link, and see how many technicians joined.
   - **New link** makes the old link stop working for new sign-ups.
   - On **Users**, set a technician to **No access** to block them.

## Deleting users

Admins can delete any user except themselves (**Users** → trash icon).
- Deleting removes the profile and records the account as removed. The rules then block that login from creating a new profile, so the person loses access immediately, even while signed in.
- Past tickets and comments keep their name.
- **Removed accounts** lists everyone removed. **Restore** brings them back with their old role (and company, for technicians).
- The underlying Firebase Auth login is not deleted, because that needs a paid Cloud Function. It has no access to anything. To remove it completely, delete it in Firebase Console → Authentication.

## Settings: colour mode & language

A **Settings** button sits at the bottom-left of every page: in the sidebar on desktop, and as a floating button on phones and on the sign-in/invite pages. It is saved per device.

- **Colour mode:** Light, Dark, or System (follows the device).
  - Dark mode redefines the colour tokens in [src/index.css](src/index.css) (`html.dark`) instead of adding `dark:` classes everywhere.
  - Areas that are dark in both modes use the `keep-white` class.
  - Text on coloured buttons uses `text-on`, which is always white.
- **Language:** English, Bahasa Melayu, 中文.
  - UI text is written in English inside `t('…')` (from `useT()`); the English text is the lookup key.
  - Translations live in [src/lib/i18n/ms.ts](src/lib/i18n/ms.ts) and [src/lib/i18n/zh.ts](src/lib/i18n/zh.ts). Any missing key falls back to English.
  - Dates use the matching locale.
  - Ticket history and messages sent to maintenance companies keep the language they were written in.

To add new UI text, wrap it in `t('…')` and add the same key to both dictionary files.

## QR stickers, photos, alerts & fix deadlines

- **QR stickers** – *Computers → QR stickers* prints a sheet of stickers (per lab, small or large).
  Each QR opens `/r/<pcId>`, which goes straight to the report form with that PC filled in.
  If the person isn't signed in, they sign in first and are sent back to the form.
  Each PC card also has a **QR** button (copy link / download PNG).
- **Photos** – up to 4 photos on a new report, and more later on the ticket page (staff, admins and the
  assigned technician, e.g. an "after repair" photo). Photos are resized in the browser to small JPEGs and
  stored in Firestore (`tickets/{id}/photos`), so no paid Storage bucket is needed.
- **Alerts** – the bell (sidebar / phone header) shows live alerts:
  admins get new reports and technician updates; the reporter gets "maintenance contacted", status changes,
  comments and "fixed"; technicians get new jobs and lab comments for their company.
  New alerts pop up as a toast, and as a desktop notification when turned on (bell or *Settings → Alerts*).
  Stored in `notifications` with an `audience` of `admins`, `user:<uid>` or `vendor:<vendorId>`.
  Automatic **email** alerts need Cloud Functions or the Trigger Email extension, which need the Blaze plan.
- **Fix deadlines (SLA)** – critical 4 h, high 24 h, medium 3 days, low 7 days from the report
  (`src/lib/sla.ts`). Tickets show "3h left" / "Overdue 2h"; the dashboard has an overdue banner and filter;
  Reports shows the on-time rate overall and per maintenance company (also in the CSV export).

Deploying this needs the new rules and index: `npm run deploy` (or `firebase deploy --only firestore,hosting`).

## Scorecards, repair cost, planned maintenance, exports, lab map, app, chat

- **Company scorecard** – after a fix, the person who reported it (or an admin) rates the repair 1–5 ★.
  *Maintenance Co.* cards and *Reports* show jobs, average fix time, on-time %, rating, reopened tickets
  and repair cost for each company. Technicians see their lab rating in the portal.
- **Repair cost & PC history** – when marking a job fixed, enter *parts replaced* and *cost (RM)*.
  Each PC has a history page (`/computers/<id>`): every fault, parts, cost, downtime. PCs with
  ≥ 3 faults in 6 months or ≥ RM 1,500 in repairs are flagged **Consider replacing** (`src/lib/stats.ts`).
- **Planned maintenance** – *Planned jobs* (admin): repeating tasks (every N days / weeks / months) for a lab,
  optionally sent to a company. When due, a ticket is created automatically. With no server on the Spark plan,
  this runs in the browser whenever an admin has LabFix open (on open and every 10 minutes); a Firestore
  transaction makes sure it is never created twice.
- **Monthly report** – *Reports → Monthly report*: a printable report (Print → *Save as PDF*) and a real
  **Excel (.xlsx)** download with Summary, Tickets, Companies, By lab and By problem type sheets.
- **Lab map** – *Computers → Lab map*: a seating plan of each lab coloured by status. Seats come from the PC's
  location, e.g. "Row 2, seat 5". Click a seat for its open ticket, report a fault, or history.
- **Install as an app (PWA)** – `public/manifest.webmanifest` + `public/sw.js`. *Install app* appears in the
  sidebar / Settings (Chrome, Edge, Android); on iPhone use Safari → Share → Add to Home Screen. Alerts pop up
  through the service worker. Push alerts while the app is fully closed would need Cloud Messaging + a server
  (Blaze plan).
- **Chat** – each ticket has a chat between the lab and the maintenance company, with quick replies.
  Messages alert everyone on the ticket; status changes and calls are listed under *History*.

## Local development with emulators

Runs the app against local Firebase Auth and Firestore. Nothing touches your live project.

```bash
npm run emulators         # terminal 1 (needs Java). Emulator UI: http://127.0.0.1:4000
npm run dev:emulators     # terminal 2. App: http://localhost:5173
```
To make a local user admin, open the Emulator UI → Firestore → `users/<uid>` and set `role` to `admin`.

## Setup

1. **Create a Firebase project** at https://console.firebase.google.com
   - *Build → Authentication → Sign-in method*: enable **Email/Password**
   - *Build → Firestore Database*: create a database
   - *Project settings → Your apps*: add a **Web app** and copy the config
2. **Configure env**
   ```bash
   cp .env.example .env   # then paste your config values
   npm install
   npm run dev
   ```
3. **Deploy rules & indexes** (required, because the computer list uses a composite index):
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add          # pick your project
   firebase deploy --only firestore
   ```
4. **Make yourself admin.** Sign up in the app (new accounts are `staff`). Then in the Firestore console open `users/<your uid>` and set `role` to `admin`. After that you can promote others from the **Users** page.
5. In the app as admin:
   - **Maintenance Co.**: add the company (phone in international format, e.g. `+60123456789`, so WhatsApp works)
   - **Computers → Bulk add**: register your labs
6. *(Optional)* Install the **Trigger Email from Firestore** extension with collection `mail` to send emails automatically.

## Hosting (Firebase Hosting)

Your live site will be at `https://<project-id>.web.app`. Firebase Auth already allows that domain.

### Option A: deploy from your PC
```bash
npm i -g firebase-tools
firebase login
firebase use --add            # choose your project (creates .firebaserc)
npm run deploy                # build + deploy hosting, rules and indexes
```
Other scripts:

| Script | What it does |
|---|---|
| `npm run deploy:hosting` | Build and upload the site only |
| `npm run deploy:rules` | Upload Firestore rules and indexes only |
| `npm run serve:hosting` | Test the production build locally at http://localhost:5000 |

`npm run build` **stops with an error if `.env` is missing or still has placeholder values**, so you can't deploy a broken site by accident.

### Option B: auto-deploy from GitHub
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds and deploys on every push to `main`. Each pull request gets its own preview URL.

1. Push this repo to GitHub.
2. Run `firebase init hosting:github` once. It creates the `FIREBASE_SERVICE_ACCOUNT` secret for you. When it asks, **don't overwrite** the existing workflow or `firebase.json`.
3. In GitHub → *Settings → Secrets and variables → Actions*, add the six `VITE_FIREBASE_*` values from your `.env`.

### What the hosting config does ([firebase.json](firebase.json))
- **SPA routing:** every URL (e.g. `/tickets/abc`) serves `index.html`, so refreshing a page works.
- **Caching:** hashed files in `/assets` are cached for one year. `index.html` is never cached, so users get a new deploy straight away.
- **Security headers:** `X-Frame-Options`, `X-Content-Type-Options` and `Referrer-Policy`.
- **Bundle:** Firebase and React go in separate files, so most deploys only change the small app file.

### Custom domain
Firebase Console → Hosting → *Add custom domain* (e.g. `labfix.yourschool.edu`). Then add that domain under **Authentication → Settings → Authorized domains** so sign-in works on it.

## Data model (Firestore)

```
users/{uid}          name, email, role: 'staff' | 'admin'
computers/{id}       assetTag, lab, location, specs, status: 'working' | 'faulty' | 'under_repair'
vendors/{id}         name, contactPerson, phone, whatsapp, email, notes, isDefault
tickets/{id}         computerId, assetTag, lab, category, title, description, priority,
                     status, reportedBy{uid,name}, vendorId, vendorName, createdAt, updatedAt, resolvedAt
tickets/{id}/events  type: 'created' | 'status' | 'call' | 'comment', message, by, at, channel?
mail/{id}            to, message{subject,text}   ← consumed by Trigger Email extension
```

Access rules are in [firestore.rules](firestore.rules).

## Project structure

```
src/
  lib/          firebase init, constants (labels/colours), formatting helpers
  hooks/        useAuth (auth + profile/role), useLiveQuery (real-time Firestore)
  services/     tickets.ts (create, status, comments, vendor call), admin.ts (PCs, vendors, users)
  components/   Layout, Modal, Badges, CallVendorDialog
  pages/        Login, Dashboard, NewTicket, TicketDetail, Computers, Vendors, Users
```
