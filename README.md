<div align="center">

<img src="public/icon-192.png" width="88" alt="LabFix logo" />

# LabFix – Computer Lab Maintenance System

**Report broken lab computers in seconds, track every repair live, and bring the maintenance company in with one tap.**

[![Live demo](https://img.shields.io/badge/Live-labfix--a16fa.web.app-1d5fed?style=for-the-badge)](https://labfix-a16fa.web.app)

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth_·_Firestore_·_Hosting-ffca28?logo=firebase&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8)

<img src="docs/screenshots/02-dashboard.png" alt="LabFix dashboard" width="900" />

</div>

---

## Contents

- [What it does](#what-it-does)
- [System flowchart](#system-flowchart)
- [Screenshots](#screenshots)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Deploying](#deploying)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [Security](#security)
- [Free-plan notes](#free-plan-notes)

## What it does

LabFix connects three groups of people around one broken computer:

| Who | What they do in LabFix |
|---|---|
| 👩‍🏫 **Lab staff** | Scan the QR sticker on a PC (or pick it from a list), describe the fault, add a photo, chat about the repair and rate it when it's fixed. |
| 🛠️ **Lab admin** | Sees every fault live, calls the maintenance company (phone, WhatsApp or email with everything filled in), tracks deadlines, plans routine maintenance, manages PCs, companies and users, and runs reports. |
| 👷 **Technician** | Joins through the company's invite link, sees **only their company's jobs**, chats with the lab, uploads photos and marks jobs fixed with parts and cost. |

## System flowchart

The complete repair journey, from a broken PC to the monthly report:

```mermaid
flowchart TD
    START(["💥 A lab PC breaks"]) --> HOW{How is it reported?}
    HOW -- "Scan QR sticker" --> QR["Report form opens<br/>with the PC already chosen"]
    HOW -- "Open LabFix" --> PICK["Report Fault → choose lab and PC"]
    QR --> SIGNED{Signed in?}
    SIGNED -- No --> LOGIN["Sign in / sign up<br/>email or Google"] --> FORM
    SIGNED -- Yes --> FORM
    PICK --> FORM["Problem type · priority · details · photos"]
    FORM --> TK["Ticket = Open · PC = Faulty<br/>fix deadline starts"]
    TK --> AL1["🔔 Admins alerted"]
    AL1 --> CALL["📞 Admin calls the company<br/>phone · WhatsApp · email + portal link"]
    CALL --> VC["Ticket = Vendor Called<br/>🔔 company + reporter"]
    VC --> TECH{"Technician has<br/>an account?"}
    TECH -- No --> JOIN["Signs up with the invite link<br/>registered under that company"] --> PORTAL
    TECH -- Yes --> PORTAL["Maintenance portal<br/>only their company's jobs"]
    PORTAL --> WORK["Start repair → In Progress<br/>💬 chat · 📷 photos"]
    WORK --> FIX["Mark as fixed<br/>parts replaced · cost"]
    FIX --> RES["Ticket = Resolved · PC = Working<br/>🔔 reporter + admins"]
    RES --> OK{"Works for the lab?"}
    OK -- No --> REOPEN["Reopen · count +1"] --> TK
    OK -- Yes --> RATE["Reporter rates ⭐ 1–5"] --> CLOSE["Admin closes"]
    CLOSE --> STATS[("Reports · scorecards ·<br/>PC history · monthly PDF / Excel")]
```

<details>
<summary><b>System architecture</b></summary>

```mermaid
flowchart LR
    subgraph People
        S["👩‍🏫 Lab staff"]
        A["🛠️ Lab admin"]
        T["👷 Technician"]
    end
    subgraph Device["Browser / installed app"]
        UI["React 19 + TypeScript<br/>Tailwind CSS v4"]
        SW["Service worker<br/>offline + pop-ups"]
    end
    subgraph Firebase["Firebase (free Spark plan)"]
        H["Hosting"]
        AU["Authentication<br/>email · Google"]
        FS[("Cloud Firestore<br/>live data + security rules")]
    end
    Q["🏷️ QR sticker"] -- "scan" --> UI
    S & A & T --> UI
    H -- "serves app" --> UI
    UI <--> AU
    UI <-- "real-time" --> FS
    UI --- SW
    UI -- "call / message" --> EXT["📞 Phone · 💬 WhatsApp · ✉️ Email"]
```

</details>

<details>
<summary><b>Ticket status lifecycle</b></summary>

```mermaid
stateDiagram-v2
    state "Vendor Called" as VendorCalled
    state "In Progress" as InProgress
    [*] --> Open: Fault reported
    Open --> VendorCalled: Admin calls the company
    VendorCalled --> InProgress: Technician starts repair
    InProgress --> Resolved: Marked as fixed
    VendorCalled --> Resolved: Marked as fixed
    Open --> Resolved: Admin
    Resolved --> Closed: Admin closes
    Resolved --> Open: Reopened
    Closed --> Open: Reopened
    Closed --> [*]
```

| Ticket | PC | Fix deadline (from report) |
|---|---|---|
| Open / Vendor Called | Faulty | Critical **4 h** |
| In Progress | Under Repair | High **24 h** |
| Resolved / Closed | Working | Medium **3 days** · Low **7 days** |

</details>

📄 **All diagrams** (roles and access, company onboarding, alerts, planned maintenance, reports, data model) are in **[docs/FLOWCHART.md](docs/FLOWCHART.md)**.

## Screenshots

> Taken with the built-in demo data. Every name, company and number is made up.

<table>
<tr>
<td width="50%"><b>Sign in</b> – email or Google, forgot password<br/><img src="docs/screenshots/01-login.png" alt="Sign-in page" /></td>
<td width="50%"><b>Dashboard</b> – live tickets, overdue banner, fix-deadline badges<br/><img src="docs/screenshots/02-dashboard.png" alt="Dashboard" /></td>
</tr>
<tr>
<td><b>Report by QR code</b> (phone) – PC filled in, duplicate warning, photo<br/><img src="docs/screenshots/03-report-qr-mobile.png" alt="Report form on a phone after scanning a QR sticker" width="300" /></td>
<td><b>Ticket</b> – progress, photos, chat, parts and cost, rating, history<br/><img src="docs/screenshots/04-ticket-detail.png" alt="Ticket details with chat and rating" /></td>
</tr>
<tr>
<td><b>Call the maintenance company</b> – message and portal link written for you<br/><img src="docs/screenshots/05-call-company.png" alt="Call maintenance company dialog" /></td>
<td><b>Live alerts</b> – bell, unread count, pop-ups<br/><img src="docs/screenshots/06-alerts.png" alt="Alerts panel" /></td>
</tr>
<tr>
<td><b>Technician sign-up</b> through the company's invite link<br/><img src="docs/screenshots/07-technician-join.png" alt="Technician joins with invite link" /></td>
<td><b>Maintenance portal</b> – only that company's jobs, deadlines, lab rating<br/><img src="docs/screenshots/08-technician-portal.png" alt="Technician portal" /></td>
</tr>
<tr>
<td><b>Lab map</b> – seats coloured by status<br/><img src="docs/screenshots/09-lab-map.png" alt="Lab seat map" /></td>
<td><b>PC history</b> – faults, parts, cost, downtime, “consider replacing”<br/><img src="docs/screenshots/10-pc-history.png" alt="PC repair history" /></td>
</tr>
<tr>
<td><b>QR stickers</b> – printable, one per PC<br/><img src="docs/screenshots/11-qr-stickers.png" alt="QR sticker sheet" /></td>
<td><b>Planned maintenance</b> – repeating jobs create tickets automatically<br/><img src="docs/screenshots/12-planned-maintenance.png" alt="Planned maintenance" /></td>
</tr>
<tr>
<td><b>Company scorecards</b> – rating, on-time %, reopened, cost<br/><img src="docs/screenshots/13-company-scorecards.png" alt="Maintenance company scorecards" /></td>
<td><b>Monthly report</b> – print to PDF or download Excel<br/><img src="docs/screenshots/15-monthly-report.png" alt="Monthly report" /></td>
</tr>
<tr>
<td><b>Dark mode</b><br/><img src="docs/screenshots/16-dark-mode.png" alt="Dark mode" /></td>
<td><b>Bahasa Melayu / 中文 / English</b><br/><img src="docs/screenshots/17-settings-malay.png" alt="Settings in Malay" /></td>
</tr>
<tr>
<td><b>Phone layout</b><br/><img src="docs/screenshots/18-mobile-dashboard.png" alt="Dashboard on a phone" width="300" /></td>
<td><b>Reports</b> – KPIs, animated 2D / 3D chart, breakdowns<br/><img src="docs/screenshots/14-reports-3d.png" alt="Reports with 3D chart" /></td>
</tr>
</table>

## Features

**Reporting and repair**
- 🏷️ **QR sticker per PC.** Scan → report form with the PC already chosen. Signed-out users sign in and come straight back. It warns if the PC already has an open ticket.
- 📷 **Photos** on reports and tickets (resized in the browser, stored in Firestore).
- 📞 **One-tap company contact** by phone, WhatsApp or email. The message includes the ticket details and the company's portal link. Every contact is logged.
- 👷 **Maintenance portal.** Technicians join through an invite link and only ever see their company's jobs. They start the repair, chat, add photos and mark it fixed with parts and cost.
- 💬 **Chat on every ticket** with quick replies. Status changes and calls are listed separately under History.
- ⏱️ **Fix deadlines (SLA)** by priority, "3h left" / "Overdue 2h" badges, an overdue banner and filter.
- 🔔 **Alerts**: bell with unread count, in-app toasts and desktop / phone pop-ups, in each reader's own language.

**Lab management**
- 🗺️ **Lab map**: a seating plan of each lab, coloured working / faulty / under repair.
- 🖥️ **PC history**: every fault, parts used, cost and downtime. PCs that keep breaking are flagged **Consider replacing**.
- 🔁 **Planned maintenance**: repeating jobs (dust cleaning, Windows updates…) that create tickets automatically, optionally sent to a company.
- 🏢 **Company scorecards**: ⭐ rating from staff, on-time %, average fix time, reopened jobs and repair cost.
- 👥 **Users and roles**: staff, admin, technician, no access. Admins can block, remove and restore users.

**Reports**
- 📊 KPIs, a reported-vs-resolved chart with an **animated 2D / 3D** view (drag to rotate), and breakdowns by problem type, lab and priority.
- 🧾 **Monthly report**: print / save as **PDF**, or download a real **Excel (.xlsx)** file with 5 sheets. Plus a CSV export.
- 🌱 **Demo data** loader: 4 labs, 63 PCs, 3 companies and about 84 tickets, which you can remove again.

**App experience**
- 💧 "Water glass" design with a branded loading animation.
- 🌗 **Light / dark / system** colour mode and 🌐 **English, Bahasa Melayu and 中文**, saved per device.
- 📱 **Installable app (PWA)** with an offline shell. Works on phones, tablets and desktops.
- 🔐 Email / password and **Google** sign-in, forgot password.

## Tech stack

| Layer | Used |
|---|---|
| UI | React 19, TypeScript, Tailwind CSS v4, lucide-react icons |
| Build | Vite 8 (Rolldown), oxlint |
| Backend | Firebase Authentication, Cloud Firestore (real-time listeners + security rules), Firebase Hosting |
| Extras | `qrcode` (QR stickers), `fflate` (Excel export), hand-made SVG charts incl. the 3D view, service worker (PWA) |

## Getting started

**Requirements:** Node.js 20+, a free Firebase project, and Java (only for the local emulators).

```bash
git clone https://github.com/xxmrkaizoo1/BOUNTY-b720a3d.git
cd BOUNTY-b720a3d
npm install
cp .env.example .env      # paste your Firebase web app config
npm run dev               # http://localhost:5173
```

### Firebase setup
1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
3. **Firestore Database:** create a database.
4. **Project settings → Your apps:** add a **Web app** and copy its config into `.env`.
5. Deploy the rules and indexes:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add
   npm run deploy:rules
   ```
6. Sign up in the app (new accounts are **staff**). In the Firestore console set `users/<your uid>.role` to `admin`. From then on, manage everyone from **Users**.
7. As admin, go to **Reports → Load demo data** to try everything, or add your own companies and **Computers → Bulk add** your labs.

### Local development without touching the live project
```bash
npm run emulators         # terminal 1 – Auth + Firestore emulators, UI at http://127.0.0.1:4000
npm run dev:emulators     # terminal 2 – the app, connected to the emulators
```

## Deploying

```bash
npm run deploy            # build + hosting + Firestore rules and indexes
npm run deploy:hosting    # site only
npm run deploy:rules      # rules and indexes only
```

- `npm run build` stops if `.env` is missing or still has placeholder values.
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) can deploy automatically on every push to `main`, with preview URLs for pull requests. Run `firebase init hosting:github` once and add the `VITE_FIREBASE_*` values as repository secrets.
- [`firebase.json`](firebase.json) sets up SPA routing, long caching for hashed assets, no caching for `index.html`, `sw.js` and the manifest, and security headers.
- For a custom domain: Hosting → *Add custom domain*, then add it under Authentication → *Authorized domains*.

## Project structure

```
src/
  main.tsx, App.tsx        app start, routes and role gates
  pages/                   Dashboard, NewTicket, TicketDetail, Computers, ComputerHistory, QrStickers,
                           Maintenance, Vendors, Users, Reports, MonthlyReport, Portal, Join, Login, Settings
  components/              Layout, Notifications, TicketChat, Photos, LabMap, Chart3D, charts, Rating,
                           CallVendorDialog, QrCode, Loading, SettingsPanel, Modal, Badge…
  services/                tickets, notify, photos, schedules, invites, admin, seed (demo data)
  hooks/                   useAuth (sign-in, profile, role), useLiveQuery (real-time Firestore)
  lib/                     firebase, settings + i18n (en / ms / zh), sla, stats, xlsx, pwa, qr, format
public/                    icons, manifest.webmanifest, sw.js
docs/                      FLOWCHART.md, screenshots/
firestore.rules            role-based security rules
firestore.indexes.json     composite indexes
```

## Data model

```
users/{uid}                  name, email, role (staff | admin | technician | disabled), vendorId?, notifSeenAt
computers/{id}               assetTag, lab, location ("Row 2, seat 5"), specs, status
vendors/{id}                 name, contactPerson, phone, whatsapp, email, notes, isDefault
invites/{code}               vendorId, vendorName, active          ← technician sign-up links
tickets/{id}                 computerId, assetTag, lab, category, title, description, priority, status,
                             reportedBy, vendorId, createdAt, resolvedAt, repair{parts,cost},
                             rating{stars,comment}, reopenCount, scheduleId?
tickets/{id}/events/{id}     created | status | call | comment (chat)
tickets/{id}/photos/{id}     small JPEG data URL
schedules/{id}               planned maintenance: lab, every, unit, nextDue, vendorId?, active
notifications/{id}           audience (admins | user:<uid> | vendor:<id>), kind, ticketId…
deletedUsers/{uid}           removed accounts
```

See the diagram in [docs/FLOWCHART.md](docs/FLOWCHART.md#9-data-model).

## Security

- Every rule is enforced on the server in [`firestore.rules`](firestore.rules):
  - Technicians can only read and update their own company's tickets.
  - New accounts can only be `staff`, or `technician` with a valid invite for that exact company.
  - Removed or blocked accounts lose access immediately.
- Secrets stay out of git: `.env` is ignored. Copy [`.env.example`](.env.example) to create it.

## Free-plan notes

LabFix runs fully on Firebase's free **Spark** plan:
- Photos are stored in Firestore instead of Storage.
- Planned maintenance runs in the browser while an admin is online, guarded by a transaction.
- Alerts are in-app and through the service worker.

Automatic emails (Trigger Email extension) and push alerts while the app is fully closed would need the **Blaze** plan.
