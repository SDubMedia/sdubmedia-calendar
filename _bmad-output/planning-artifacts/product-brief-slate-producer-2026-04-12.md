---
stepsCompleted: [1, 2]
inputDocuments:
  - "Expense-AAO_10-22-24.pdf (Dave's Uber expense report, 10 rides, Chicago, $270.46)"
  - "Kole-10-22-24-invo5027.pdf (Dave's ATLAS invoice, 3-section: time/expenses/per-diem, $8,702.46)"
  - "Conversation context: idea dump, party-mode analysis, data model breakdown"
date: 2026-04-12
author: Geoffski
---

# Product Brief: Slate Producer

## Executive Summary

Slate Producer is a standalone mobile-first application for freelance live-event production crew — producers, projection technicians, camera operators, audio engineers, lighting techs, stage managers, and similar roles — who work multi-day gigs for large companies and production houses. The US live-event production freelancer market encompasses 250,000+ professionals, and not a single tool exists that addresses their specific workflow.

These freelancers spend hours per gig on administrative overhead that should take minutes: manually tracking hours across complex overtime and double-time rules (including IATSE union regulations and rest-period compliance), screenshotting Uber and Lyft receipts, looking up GSA per diem rates by zip code, assembling expense reports by hand, digging through show documents to find call times and breakfast locations, tracking gear rentals, chasing unpaid invoices, and building professional branded invoices that combine time, expenses, per diem, and equipment rental into a single document.

The financial impact is direct and measurable. A freelancer billing a $750 day rate who misses just one overtime hour per gig at 1.5X loses $112.50. Across 15–20 gigs per year, that's $1,700–$2,250 in lost income annually — more than 10X the cost of a Slate Producer subscription. Add misplaced receipts, forgotten per diem claims, and unbilled gear rental days, and the real number is significantly higher.

Slate Producer eliminates this overhead entirely. The app manages the full lifecycle of a gig — from parsing the initial deal memo and gig packet, to daily briefings with call times, weather, and nearby amenities, to automatic time tracking with configurable overtime rules and rest-period violation alerts, to receipt capture and auto-categorization, to GSA per diem lookups, to gear rental billing, to branded invoice generation with payment tracking and aging. The product gives freelancers back hours of their lives so they can focus on the work, not the paperwork.

The product launches as a standalone subscription ($14.99/mo base, $24.99/mo Pro with AI-powered document intelligence, GSA auto-lookup, and receipt email parsing) distributed via the Apple App Store. It connects to the existing Slate platform through a shared ecosystem, enabling production companies on Slate to invite their freelance crew into Producer — creating a powerful network effect and viral adoption loop. When a production company tells its freelancers "use Producer so we can see your hours," adoption becomes organic. A built-in gig referral network amplifies this further: freelancers who can't take a gig can refer it to other Producer users, driving user-to-user growth.

Platform administration includes super-admin impersonation for troubleshooting individual user experiences, mirroring the existing Slate admin pattern.

Dave Kole (ATLAS Events, Boise, ID), a freelance lead projection technician, serves as the founding design partner. His real invoices, expense reports, and daily workflow inform every design decision.

---

## Core Vision

### Problem Statement

Freelance live-event crew members are skilled technicians and producers who spend a disproportionate amount of their non-gig time on administrative busywork. A single 9-day gig generates dozens of touchpoints that must be manually tracked, assembled, and invoiced: daily time entries with overtime calculations that vary by client, union, and jurisdiction; ride-share receipts that must be screenshotted and compiled into PDFs; per diem rates that require looking up zip codes on GSA.gov; gear rental charges for personally-owned equipment; hotel stays; flights; and complex rest-period compliance rules that trigger penalty pay when violated — all of which must be combined into a professional branded invoice.

Show documents arrive as PDFs with critical daily information buried in dense formatting — call times, meal locations and rooms, hotel floor maps, production schedules — requiring manual extraction every morning of every gig. Freelancers are navigating unfamiliar cities without knowing where the nearest coffee shop is or what time breakfast opens in which ballroom.

Beyond the per-gig overhead, freelancers lack tools for the business of freelancing itself: tracking which clients owe them money, managing availability across competing gig offers, maintaining rate history for negotiations, preparing tax documents at year-end, and referring work to trusted colleagues when they can't take a gig.

The result: freelancers lose hours per gig to paperwork, forget to log overtime because they can't remember what time they left the venue, lose receipts, miss rest-period penalty pay they're entitled to, and leave money on the table. The administrative burden scales linearly with the number of gigs, creating a ceiling on how much work a freelancer can take on before the back-office overhead becomes unsustainable.

### Problem Impact

- **Lost revenue:** Forgotten overtime hours, misplaced receipts, missed rest-period violations, and unbilled expenses directly reduce income. A single missed OT hour at 1.5X on a $75/hr rate is $112.50 lost. Across 15–20 gigs per year, that's $1,700–$2,250 in annual lost income from overtime alone — before accounting for lost receipts and unbilled gear rental days.
- **Lost time:** Manual invoice assembly (screenshotting receipts, formatting PDFs, looking up GSA rates, compiling deal memos) consumes 1–3 hours per gig that could be spent resting, networking, or taking additional work.
- **Stress and cognitive load:** Freelancers on multi-day gigs are already working 10–14 hour days. Adding administrative overhead to exhausting physical work compounds burnout and leads to errors. Digging through PDFs every morning to find call times and meal locations adds unnecessary friction to already demanding days.
- **Unprofessional billing:** Manual assembly leads to inconsistent invoice formats, missing line items, and delayed billing — all of which erode client confidence and slow payment.
- **Cash flow blindness:** Without payment tracking, freelancers don't know who owes them money or how long invoices have been outstanding until they manually check their bank accounts.
- **Tax season chaos:** No consolidated view of annual income, expenses, or mileage means hours spent reconstructing records for CPAs and estimated quarterly tax payments.

### Why Existing Solutions Fall Short

- **Expensify / Concur:** Designed for corporate employees submitting to internal finance teams, not freelancers invoicing clients directly. No overtime rules, no per diem calculation, no gear rental, no gig-based organization, no deal memo parsing.
- **QuickBooks Self-Employed / FreshBooks:** General freelancer invoicing tools with no understanding of production-specific workflows — day rates vs. hourly, OT/DT thresholds, meal penalties, lobby-to-lobby billing, GSA per diem, rest-period compliance, IATSE rules.
- **Generic time trackers (Toggl, Clockify):** Track hours but don't understand overtime tiers, don't calculate pay, don't connect to expenses or invoicing, don't alert on rest-period violations.
- **Manual tools (spreadsheets, Notes app, receipt photos):** What most freelancers actually use today. Flexible but error-prone, time-consuming, and impossible to scale.

No existing tool combines gig management, production-specific time tracking with OT/DT rules, receipt capture, GSA per diem, gear rental, deal memo parsing, daily briefings, payment tracking, union compliance, and branded invoice generation into a single workflow purpose-built for live-event freelancers.

### Proposed Solution

Slate Producer is a mobile-first, offline-capable application that manages the complete gig lifecycle for freelance live-event crew:

1. **Daily Briefing Card** — The home screen. A single glanceable card showing today's call time, meal locations (extracted from show docs), wrap target, current hours vs. OT threshold, per diem rate, weather at venue, and nearby coffee/food. This is the daily relationship with the product — the screen Dave opens every morning before he leaves the hotel room.

2. **Production Calendar + Personal Sync** — A calendar view of all gigs (upcoming, active, past) with iCal feed and Google Calendar sync so gig schedules automatically appear in the freelancer's personal calendar. Shareable availability windows so production companies can see when a freelancer is free.

3. **Gig Setup + Deal Memo Parsing** — Create a gig manually or upload a deal memo / gig packet and let AI extract: client, venue, hotel, date range, day-by-day scope, rate, OT/DT rules, per diem terms, and gear requirements. Configure billing mode (lobby-to-lobby vs. on-property vs. door-to-door), per diem type (GSA auto-lookup by zip or flat rate), and client-specific OT rules (including IATSE templates). Client presets save these configurations for repeat clients.

4. **Time Tracking + Overtime Engine** — One-tap clock in/out with geofencing capability (native app). Configurable overtime rules per gig: OT threshold (e.g., after 10 hrs → 1.5X), DT threshold (e.g., after 14 hrs → 2X), meal penalties (after X hours without break). Automatic rest-period violation detection with real-time alerts ("Tomorrow's call time violates 10-hour turnaround — penalty rate applies"). Travel time tracking for lobby-to-lobby billing.

5. **Expense Capture + Auto-Assignment** — Photo-to-expense via camera with AI data extraction. Email forwarding for Uber/Lyft/airline receipts with automatic parsing. Auto-association to active gig by date. Support for client-paid items that appear on invoices as "PAID" without adding to the total. Personal vehicle mileage tracking at IRS federal rate.

6. **Gear Rental Inventory** — "My Gear" section where freelancers list personally-owned equipment with per-day or flat rental rates. Gear checklist templates by gig type ("LED wall gig" = these 15 items). Attach gear to gigs as billable line items. Packing checklists with tap-to-confirm before departure.

7. **Invoice Generation + Payment Tracking** — Professional, white-labeled invoices in the freelancer's own branding (logo, colors, payment terms, CC surcharge policy). Three-section format matching industry standard: time/rate entries with OT/DT breakdowns, itemized expenses with route descriptions, and incidental expenses (per diem, gear rental). Custom invoice numbering. Exportable as PDF. Payment status tracking (sent → viewed → paid) with automatic reminders at 30/60/90 days. Invoice aging dashboard showing total outstanding across all clients.

8. **Travel Document Wallet** — Per-gig storage for flight confirmations, hotel confirmations, venue credentials, parking passes, rental car info, and any other travel documents. Everything for one gig in one place, accessible offline.

9. **Client CRM + Rate History** — Contact management for production companies and key personnel. Rate history per client with trend visibility ("Your average day rate with Top Notch is $750, but you charged $850 for the last two gigs"). Last-worked-for dates, total revenue per client, gig count.

10. **Annual Dashboard + Tax Prep** — Year-to-date income by client (for 1099 reconciliation), total expenses by category (for Schedule C), total mileage (IRS deduction), and quarterly income breakdown for estimated tax payments. CPA-ready export.

11. **Gig Referral Network** — When a freelancer can't take a gig, they can refer it to another Producer user with one tap. The recipient gets pre-populated gig details. Optional referral fee tracking. Every referral is a potential new user — this is the viral growth loop.

12. **Notifications + Reminders** — Push notifications for: OT threshold approaching, rest-period violations, unassigned receipts, upcoming call times, invoice payment reminders, and daily briefing summary. Configurable per-user. The "staying organized" layer that prevents Dave from forgetting to log his time or losing a receipt.

13. **Platform Connection** — Shared ecosystem with Slate enables production companies to discover and invite freelancers, pre-populating gig details and enabling two-way visibility. This is the strategic moat — when a company uses Slate and tells its crew "use Producer," adoption is organic and non-optional.

14. **Offline-First Architecture** — All core functionality (clock in/out, receipt photo capture, briefing card, document wallet, gear checklist) works without connectivity. Syncs when connection is available. Convention centers and hotel basements have unreliable WiFi — the app cannot depend on it.

15. **Accessibility** — Full VoiceOver/accessibility compliance for App Store requirements. Clock-in and briefing card flows must work when the freelancer's hands are full of cable and they're using voice control.

### Key Differentiators

- **The daily briefing card.** No competitor surfaces "your call time is 6:30 AM, breakfast is in Salon B, Starbucks is 4 min walk, weather is 42°F and clear" from uploaded show docs. This alone saves cognitive load every morning of every gig and creates a daily habit loop.
- **Built for production, not adapted from generic tools.** OT/DT rules, day rates, GSA per diem, lobby-to-lobby billing, gear rental, meal penalties, rest-period violations, IATSE compliance — these are first-class concepts, not workarounds.
- **Invoice format matches industry expectation.** The three-section invoice (time + expenses + incidentals) is what clients expect. Generated automatically from accumulated gig data — zero manual assembly.
- **The network effect is the moat.** Production companies on Slate invite freelancers to Producer. Freelancers refer gigs to other freelancers. Both loops drive organic adoption without marketing spend. Once a critical mass of a freelancer's clients expect Producer invoices, switching costs are high.
- **Union-aware from day one.** Pre-loaded IATSE rate cards and OT rules as templates. Rest-period violation detection with real-time alerts. This is a distribution channel — union locals can recommend the app to members.
- **Offline-first.** Core workflows function without connectivity. Competitors assume reliable internet — live-event venues don't provide it.
- **Designed by a production company, for production people.** SDub Media lives this workflow. The product is built from real invoices, real gig packets, and real pain — not market research abstractions.
- **Annual ROI is undeniable.** At $14.99/mo ($180/year), the app pays for itself if it catches a single forgotten OT hour. Realistic annual savings: $2,000+ in recovered revenue plus 20–40 hours of reclaimed time.
