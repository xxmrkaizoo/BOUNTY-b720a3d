# LabFix – System flowcharts

How LabFix works, end to end. The diagrams are written in [Mermaid](https://mermaid.js.org), so GitHub draws them automatically.

- [1. System architecture](#1-system-architecture)
- [2. Complete repair flow](#2-complete-repair-flow)
- [3. Ticket status lifecycle](#3-ticket-status-lifecycle)
- [4. Sign-in, roles and access](#4-sign-in-roles-and-access)
- [5. Maintenance company onboarding](#5-maintenance-company-onboarding)
- [6. Alerts: who is told what](#6-alerts-who-is-told-what)
- [7. Planned maintenance](#7-planned-maintenance)
- [8. Reports, scorecards and exports](#8-reports-scorecards-and-exports)
- [9. Data model](#9-data-model)

---

## 1. System architecture

```mermaid
flowchart LR
    subgraph People
        S["👩‍🏫 Lab staff"]
        A["🛠️ Lab admin"]
        T["👷 Technician<br/>(maintenance company)"]
    end

    subgraph Device["Browser / installed app (PWA)"]
        UI["React 19 + TypeScript<br/>Tailwind CSS v4"]
        SW["Service worker<br/>offline shell + pop-up alerts"]
        RUN["Schedule runner<br/>(while an admin is online)"]
    end

    subgraph Firebase["Firebase (Spark / free plan)"]
        H["Hosting<br/>labfix-a16fa.web.app"]
        AU["Authentication<br/>email · Google"]
        FS[("Cloud Firestore<br/>live data + security rules")]
    end

    subgraph Outside["Outside LabFix"]
        Q["🏷️ QR sticker on each PC"]
        PH["📞 Phone"]
        WA["💬 WhatsApp"]
        EM["✉️ Email"]
    end

    S & A & T --> UI
    Q -- "scan → /r/PC-id" --> UI
    H -- "serves app" --> UI
    UI <--> AU
    UI <-- "real-time listeners" --> FS
    UI --- SW
    UI --- RUN
    RUN -- "transaction" --> FS
    UI -- "call / message + portal link" --> PH
    UI --> WA
    UI --> EM
    EM -. "optional Trigger Email extension (Blaze)" .-> FS
```

---

## 2. Complete repair flow

```mermaid
flowchart TD
    START(["💥 A lab PC breaks"]) --> HOW{How is it reported?}
    HOW -- "Scan QR sticker" --> QR["/r/PC-id opens the report form<br/>with the PC already chosen"]
    HOW -- "Open LabFix" --> PICK["Report Fault → choose lab and PC"]
    QR --> SIGNED{Signed in?}
    PICK --> FORM
    SIGNED -- No --> LOGIN["Sign in / sign up<br/>(email or Google)"] --> FORM
    SIGNED -- Yes --> FORM
    FORM["Report form<br/>problem type · priority · summary · details · up to 4 photos"]
    FORM --> DUP{"PC already has<br/>an open ticket?"}
    DUP -- Yes --> WARN["Warning + link to that ticket<br/>(comment there instead)"] --> SUBMIT
    DUP -- No --> SUBMIT["Submit"]
    SUBMIT --> TK["Ticket = Open<br/>PC = Faulty<br/>fix deadline starts (SLA)"]
    TK --> AL1["🔔 Alert to all admins"]
    AL1 --> ADM["Admin opens the ticket"]
    ADM --> CALL["📞 Call maintenance company<br/>phone · WhatsApp · email<br/>message + portal link filled in"]
    CALL --> VC["Ticket = Vendor Called<br/>company assigned · 🔔 company + reporter"]
    VC --> TECH{"Technician has<br/>an account?"}
    TECH -- No --> JOIN["Opens portal link<br/>signs up under that company"] --> PORTAL
    TECH -- Yes --> PORTAL["Maintenance portal<br/>sees only their company's jobs"]
    PORTAL --> START_R["Start repair<br/>Ticket = In Progress · PC = Under Repair"]
    START_R --> CHAT["💬 Chat with the lab<br/>📷 add photos"]
    CHAT --> FIX["Mark as fixed<br/>note · parts replaced · cost (RM)"]
    FIX --> RES["Ticket = Resolved<br/>PC = Working · 🔔 reporter + admins"]
    RES --> OK{"Works for the lab?"}
    OK -- No --> REOPEN["Admin reopens<br/>reopen count +1"] --> TK
    OK -- Yes --> RATE["Reporter rates the repair ⭐ 1–5"]
    RATE --> CLOSE["Admin closes the ticket"]
    CLOSE --> STATS[("Reports · company scorecards<br/>PC history · monthly report")]
    STATS --> END(["✅ Done"])
```

---

## 3. Ticket status lifecycle

```mermaid
stateDiagram-v2
    [*] --> Open: Staff reports a fault
    Open --> VendorCalled: Admin calls the company
    [*] --> VendorCalled: Planned job sent to a company
    VendorCalled --> InProgress: Technician starts repair
    Open --> InProgress: Admin
    VendorCalled --> Resolved: Technician marks fixed
    InProgress --> Resolved: Technician / admin marks fixed
    Open --> Resolved: Admin
    Resolved --> Closed: Admin closes
    Resolved --> Open: Reopened (still broken)
    Closed --> Open: Reopened
    Closed --> [*]

    state "Vendor Called" as VendorCalled
    state "In Progress" as InProgress
```

| Ticket status | PC status | Who can move it |
|---|---|---|
| Open | Faulty | staff create · admin any move |
| Vendor Called | Faulty | admin (by calling the company) |
| In Progress | Under Repair | technician of the assigned company, admin |
| Resolved | Working | technician of the assigned company, admin |
| Closed | Working | admin |

Fix deadline (SLA) from the moment it is reported: **critical 4 h · high 24 h · medium 3 days · low 7 days**.

---

## 4. Sign-in, roles and access

```mermaid
flowchart TD
    VISIT(["Open LabFix"]) --> AUTH{Signed in?}
    AUTH -- No --> LG["Login page<br/>email · Google · forgot password"]
    LG --> AUTH
    AUTH -- Yes --> PROF{Profile in Firestore?}
    PROF -- No --> TOMB{"Removed by an admin?<br/>(deletedUsers)"}
    TOMB -- Yes --> NOA1["⛔ Account removed page"]
    TOMB -- No --> INV{Came from an invite link?}
    INV -- Yes --> MKT["Create profile:<br/>role = technician of that company"]
    INV -- No --> MKS["Create profile:<br/>role = staff"]
    MKT --> ROLE
    MKS --> ROLE
    PROF -- Yes --> ROLE{Role}
    ROLE -- staff --> ST["Tickets · Report fault · Computers · Reports"]
    ROLE -- admin --> AD["Everything staff can do +<br/>call companies · statuses · planned jobs ·<br/>companies · users · demo data"]
    ROLE -- technician --> TE["Maintenance portal only:<br/>their company's jobs"]
    ROLE -- disabled --> NOA2["⛔ Access removed page"]
```

All of this is enforced on the server by [firestore.rules](../firestore.rules), not only hidden in the UI.

---

## 5. Maintenance company onboarding

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant App as LabFix
    participant DB as Firestore
    actor Tech as Technician

    Admin->>App: Maintenance Co. → add company
    Admin->>App: Ticket → Call maintenance company
    App->>DB: get / create invite code for the company
    App-->>Admin: WhatsApp / email text incl. /join/CODE?ticket=ID
    Admin->>Tech: sends the message (phone · WhatsApp · email)
    Tech->>App: opens the link
    App->>DB: read invites/CODE (company name)
    Tech->>App: sign up (email or Google)
    App->>DB: users/UID role=technician + vendorId (rules check the invite)
    App-->>Tech: lands on the job in the portal
    Note over Admin,DB: "New link" replaces the code · "No access" blocks a technician
```

---

## 6. Alerts: who is told what

```mermaid
flowchart LR
    E1["New fault reported"] --> ADM["Admins"]
    E2["Company called"] --> CO["Company technicians"]
    E2 --> REP["Reporter"]
    E3["Status changed by technician"] --> ADM
    E3 --> REP
    E4["Status changed by admin"] --> CO
    E4 --> REP
    E5["Fixed"] --> REP
    E6["Chat message / photo"] --> ADM & CO & REP
    E7["Rating"] --> CO & ADM
    E8["Planned job due"] --> CO

    ADM & CO & REP --> OUT["🔔 Bell with unread count<br/>toast pop-up in the app<br/>desktop / phone pop-up (service worker)"]
```

Alerts are saved in `notifications` with an `audience` of `admins`, `user:<uid>` or `vendor:<companyId>`, in the same write as the change that caused them. The text is built when shown, so each person reads it in their own language.

---

## 7. Planned maintenance

```mermaid
flowchart TD
    SET["Admin creates a schedule<br/>task · lab · every N days/weeks/months ·<br/>first due date · company (optional)"] --> WAIT
    WAIT["Admin has LabFix open<br/>check on start + every 10 min"] --> DUE{"Any active schedule<br/>with nextDue ≤ now?"}
    DUE -- No --> WAIT
    DUE -- Yes --> TX["Firestore transaction<br/>(safe with several admins online)"]
    TX --> NEW["Create ticket for 'All PCs' in the lab"]
    NEW --> CO{Company chosen?}
    CO -- Yes --> ASG["Status = Vendor Called<br/>🔔 company technicians"]
    CO -- No --> OPN["Status = Open"]
    ASG & OPN --> NEXT["nextDue = next date in the future"]
    NEXT --> WAIT
    SET -. "Create ticket now" .-> TX
```

---

## 8. Reports, scorecards and exports

```mermaid
flowchart LR
    TK[("tickets")] --> R["Reports page<br/>KPIs · 2D / 3D trend · by type · by lab ·<br/>fix time · repeat PCs"]
    TK --> SC["Company scorecards<br/>jobs · avg fix time · on time % ·<br/>⭐ rating · reopened · cost"]
    TK --> PH["PC history<br/>faults · parts · cost · downtime ·<br/>'consider replacing' flag"]
    TK --> MR["Monthly report"]
    MR --> PDF["🖨️ Print / Save as PDF"]
    MR --> XL["📊 Excel .xlsx (5 sheets)"]
    R --> CSV["CSV export"]
    PC[("computers")] --> MAP["Lab map<br/>seats coloured by status"]
    PC --> PH
```

---

## 9. Data model

```mermaid
erDiagram
    USERS ||--o{ TICKETS : "reports"
    VENDORS ||--o{ TICKETS : "is assigned"
    VENDORS ||--o{ USERS : "employs (technicians)"
    VENDORS ||--o| INVITES : "has link"
    COMPUTERS ||--o{ TICKETS : "has faults"
    TICKETS ||--o{ EVENTS : "history + chat"
    TICKETS ||--o{ PHOTOS : "has"
    SCHEDULES ||--o{ TICKETS : "creates"
    TICKETS ||--o{ NOTIFICATIONS : "raises"

    USERS {
        string name
        string email
        string role
        string vendorId
    }
    COMPUTERS {
        string assetTag
        string lab
        string location
        string status
    }
    VENDORS {
        string name
        string phone
        string whatsapp
        string email
        bool isDefault
    }
    TICKETS {
        string status
        string priority
        string category
        string vendorId
        map rating
        map repair
        int reopenCount
    }
    EVENTS {
        string type
        string message
        map by
        timestamp at
    }
    PHOTOS {
        string dataUrl
        int width
        int height
    }
    SCHEDULES {
        string title
        string lab
        int every
        string unit
        timestamp nextDue
        bool active
    }
    NOTIFICATIONS {
        string audience
        string kind
        string ticketId
    }
    INVITES {
        string vendorId
        bool active
    }
```
