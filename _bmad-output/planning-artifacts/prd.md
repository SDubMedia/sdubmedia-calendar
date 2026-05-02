---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation-skipped
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
classification:
  projectType: saas_b2b
  domain: service_business_operations
  complexity: medium
  projectContext: brownfield
inputDocuments:
  - "/Users/geoffski/sdubmedia-calendar/CLAUDE.md (project rules — Slate stack, conventions, security rules)"
  - "/Users/geoffski/sdubmedia-calendar/_bmad-output/planning-artifacts/product-brief-slate-producer-2026-04-12.md (related product — Slate Producer; tangential context only)"
  - "Conversation context: 8 reference PDFs (Wedding Day Proposal, Mini/Senior/Immediate/Extended/Large Family contracts, Engagement Day Contract, FOMO, Toast Edit), 2 HoneyBook screenshots (Templates hub, Packages building blocks), full plan dialogue covering templates hub + reusable packages + lead-to-contract pipeline + billing at signing"
workflowType: 'prd'
date: 2026-04-30
author: Geoffski
project_name: Slate Templates & Inquiry Pipeline
---

# Product Requirements Document — Slate Templates & Inquiry Pipeline

**Author:** Geoffski
**Date:** 2026-04-30

## Reading Guide

This PRD is organized for both human review and downstream LLM consumption (UX → Architecture → Epics).

| Section | Purpose |
|---|---|
| Executive Summary | Vision, differentiator, target user, success-metric framing |
| Project Classification | Stack, domain, complexity, brownfield context |
| Success Criteria | User / business / technical / measurable outcomes |
| Product Scope | High-level MVP / Growth / Vision feature lists |
| User Journeys | 5 narrative journeys revealing required capabilities |
| Domain-Specific Requirements | Compliance, technical constraints, integration, **architectural principles**, **risk mitigations** |
| SaaS B2B Specific Requirements | RBAC matrix, subscription tiers, integration surfaces, RLS rules |
| Project Scoping & Phased Development | **Operational detail** — sub-phases, ship targets, kill criteria, timeline |
| Functional Requirements | 54 capability statements (FR1–FR54) |
| Non-Functional Requirements | 44 quality attributes (NFR1–NFR44) |

The two highest-leverage sections for downstream work are **Functional Requirements** (capability contract) and **Project Scoping & Phased Development** (operational sequencing).

## Executive Summary

Slate is the operating system for solo creatives and small production teams (up to 10 people) who want to run their entire business in one place. Today's customers are forced to maintain HoneyBook for client intake, proposals, contracts, and deposit billing alongside Slate for everything else — projects, calendars, payroll splits, invoicing, gallery delivery, Stripe payouts. The Templates & Inquiry Pipeline closes that gap.

This work delivers an embeddable contact form, a reusable Packages library, block-based proposal templates that render at parity with hand-built Canva PDFs, master contract templates with conditional sections that adapt to client selections, an approval-gated auto-contract-generation flow, and Stripe deposit billing triggered at signing. All of it plugs into Slate's existing Pipeline, Stripe Connect, RLS multi-tenancy, contract signing, and R2 storage — roughly 80% of the work is wiring infrastructure that already exists.

The target user is a solo videographer or photographer billing $50K–$500K/year who runs 20–60 inquiries annually. They are not operations professionals; they are creatives who resent admin work. The Templates & Inquiry Pipeline is **owner-administered by default** — the owner is the sole admin of Packages, proposal templates, master contracts, and contact forms. To support studios with up to 10 people, the owner can grant individual users **four granular per-user toggles** that delegate execution work (lead triage, proposal drafting & sending, contract draft editing, contract approval & sending) without ever delegating the underlying business configuration.

The success metric is behavioral: a Slate user has not logged into HoneyBook in 30 days. Migration happens one inquiry at a time, not big-bang.

### What Makes This Special

Templates in Slate are not documents — they are dynamic outputs of structured data. A user builds Packages once (icon, description, price, deliverables) and Master Contracts once (clauses with conditional rules: always-show, show-if-package-selected, show-if-not-selected). Every proposal and every contract Slate ever generates afterwards is an automatic re-arrangement of that data. This eliminates the HoneyBook pain of maintaining five near-duplicate family-session contracts — they collapse into one master with conditional pricing/image-count blocks. It also eliminates the Canva pain of "the design breaks the moment a client wants to swap a package" — selectable packages on the public proposal viewer rebuild the document live as the client checks boxes.

The differentiating moment is the inquiry-to-signed-contract path. A stranger fills out the contact form on the user's website at midnight. The user gets an iMessage. The next morning, they pick a proposal template and one click sends a glossy on-brand proposal with selectable packages. The client accepts; Slate auto-builds a draft contract from a master template with the right deposit amount calculated, and drops it in the user's queue for review. The user approves; the contract sends, the client signs, Stripe charges the deposit automatically. The user never touched a Canva file, never copy-pasted an address, never typed a price, never opened HoneyBook.

The core insight: every existing competitor (HoneyBook, Studio Ninja, Sprout Studio, Iris Works, Tave) treats templates as documents. Slate treats them as a thin presentation layer over the same Pipeline + Packages data the rest of the business already runs on. Because Slate already owns Galleries, Calendars, Projects, Payroll, Invoicing, and Stripe, the consolidation is one-tool-deeper than any HoneyBook competitor can be — and one-tool-deeper than HoneyBook itself.

## Project Classification

- **Project Type:** SaaS B2B web app — React 19 + Vite + Tailwind CSS 4 frontend, Vercel serverless API, Supabase Postgres with RLS multi-tenancy, Stripe Connect for client payments, Resend for transactional email, R2 for media storage. Live at slate.sdubmedia.com with paid Free/Basic/Pro tiers.
- **Domain:** Service-business operations / creative-services back-office. Light fintech surface (Stripe Connect, deposit billing) and light legaltech surface (electronic contracts, e-signatures, signed-PDF retention). Neither is regulated.
- **Complexity:** Medium. Brownfield integration crossing existing subsystems (Pipeline, Stripe Connect, contract signing, RLS multi-user, public viewer routes, R2 uploads, webhook handlers). Adds a public-facing form which raises the integration surface but is not novel architecturally.
- **Project Context:** Brownfield. Slate is in production with paid customers. All work in this PRD adds to or augments existing infrastructure; no system replacements.

## Success Criteria

### User Success

- **Inquiry-to-proposal-sent:** under 90 seconds from clicking the lead card to the proposal email landing in the client's inbox. Today in HoneyBook this is 8–15 minutes (open the right template, retype client name, hand-pick packages, build a payment schedule, send).
- **Acceptance-to-draft-contract:** zero manual work. The draft contract appears in the user's queue within 30 seconds of client acceptance, with the deposit pre-calculated and the right conditional sections included based on what they selected.
- **Contract approval-to-deposit-paid:** zero manual touches after the user clicks "Approve & Send." Client signs, Stripe charges the deposit, both receipts go out automatically.
- **Aha moment:** the first time a client selects packages on the public proposal and the user opens Slate to find a fully filled-in contract draft sitting there waiting for review — with the exact right clauses for those selections.
- **Trust moment:** the user goes a full weekend without checking Slate. Monday morning: 3 new leads have proposals out, 1 signed contract has a deposit paid, and they didn't lift a finger.
- **North-star qualitative measure:** "I haven't opened HoneyBook in 30 days."

### Business Success

- **90 days post-launch:** every existing paying Slate customer (current + new signups in the window) has built at least one Package and sent at least one proposal-to-contract through the new pipeline. Measured in admin dashboard.
- **90 days post-launch:** at least 10 customers self-report (via in-app survey or churn-from-HoneyBook signal) that they have downgraded or cancelled HoneyBook.
- **6 months:** Slate's average paid-tier ARPU lifts because HoneyBook fees ($39–$129/mo) shift to Slate. Justifies a $29–$39/mo Pro+ tier that bundles the full templates pipeline.
- **12 months:** at least one customer has explicitly migrated to Slate from HoneyBook citing the templates/inquiry pipeline (not just galleries or scheduling).

### Technical Success

- **No RLS regressions:** `pnpm test:rls` passes after every new table (packages, contact_forms, leads, etc.) — cross-tenant isolation maintained.
- **Public form bot tolerance:** rate-limited via Upstash Redis (already wired). Form spam doesn't fill the leads stage with garbage.
- **Auto-generated contract integrity:** every generated contract passes a sanity lint — no broken merge fields, no missing deposit amount, no client-visible HTML errors. CI gate.
- **Deposit-billing graceful degradation:** if Stripe Checkout fails at signing time, the contract is still considered signed; deposit charge retries via webhook. Failure mode never blocks the contract being on file.
- **Zero existing-flow regression:** the existing Proposals, Contracts, Pipeline, Stripe, Galleries, and signing E2E + unit tests stay green throughout the work.

### Measurable Outcomes

| Event | Latency target |
|---|---|
| Form submission → iMessage to owner | < 5 seconds |
| "Send Proposal" click → client receives email | < 10 seconds |
| Client accepts → draft contract in owner's queue | < 30 seconds |
| Owner approves contract → client receives signing link | < 30 seconds |
| Client signs → Stripe deposit charge initiated | < 60 seconds |
| Cross-tenant data leak via any new endpoint | 0 (verified by RLS smoke test) |

## Product Scope

This section gives the high-level feature list per phase. **For sub-phasing, ship dates, kill criteria, and operational sequencing, see Project Scoping & Phased Development below.**

### MVP — Minimum Viable Product

The smallest version Geoff (and any other paying Slate user) can run an entire wedding inquiry on. Closes the HoneyBook loop.

- Block-based proposal templates (fixes the rendering bug; replaces the textarea editor with a block stack including hero, prose, package row, divider, signature, etc.)
- Reusable Packages — CRUD, curated Lucide icon picker, R2 image upload, price + deliverables list
- Master contract templates with conditional sections (always-show / show-if-package / show-if-not-package)
- Selectable packages on the public proposal viewer; total updates live
- Auto-generated draft contract on acceptance — owner approval required before send
- Stripe deposit billing triggered at signing
- Embeddable contact form (one form per org, default field set)
- Leads as a stage in existing Pipeline (not a separate tool)
- Owner notifications via Kevin iMessage + email when a lead lands

### Growth Features (Post-MVP)

What makes it competitive for the next wave of customers (small studios, not just solo creatives).

- Templates Hub navigation (one place for proposals, contracts, packages, forms, emails)
- Onboarding wizard for new users (3-step setup: first package, first proposal, first form)
- Starter templates gallery — clone "Wedding Proposal," "Family Session Master," "FOMO Edit Contract" instead of starting from scratch
- Multiple contact forms per org (Wedding inquiry vs. Family Portrait inquiry routes to different proposal templates automatically)
- Custom SVG icon upload (beyond curated Lucide set)
- Conditional rules on proposal blocks (not just contracts) — "show this section only if Wedding Day package selected"
- Package conversion analytics ("Sizzle Reel attaches to 60% of accepted proposals")
- Email template library inside Slate (replaces HoneyBook automations for transactional sends)

### Vision (Future)

- AI-assisted proposal generation ("write a Wedding Proposal for Sarah, $5K budget, summer wedding")
- Questionnaires — multi-step pre-call qualification forms (full HoneyBook smart-files parity)
- Workflow automations — "when proposal accepted, send onboarding email; 7 days before event, send pre-shoot questionnaire"
- Scheduled sends — "send this proposal Tuesday at 9am"
- Community marketplace of user-built starter templates
- Multi-language proposals/contracts (Spanish first — large market)

## User Journeys

### Journey 1 — Sarah, Solo Wedding Videographer (Happy Path)

**Opening Scene.** Sarah is a 31-year-old solo wedding videographer in Nashville running 28 weddings a year. It's 11pm on a Saturday in May. She's mid-edit on a wedding she shot last weekend, headphones on, deep in After Effects. Her phone buzzes — an iMessage from her own number that says: *"New wedding lead — Mike & Jenny — June 14 at Front Porch Farms. Click to send proposal."*

**Rising Action.** She doesn't break focus. The next morning, coffee in hand, she opens Slate. The Pipeline shows a new card in the **Lead** column with everything Mike & Jenny submitted: names, email, phone, June 14, Front Porch Farms, "Looking for full coverage video, ~150 guests, want to make sure my grandparents who can't travel see the whole ceremony." She clicks the card. Two buttons stare at her: *"Send Wedding Proposal"* and *"Decline."* She picks the wedding template. Slate auto-fills Mike, Jenny, June 14, Front Porch Farms — even pulls the venue address from her past project at the same venue. The proposal already has her three core packages attached (Full Coverage, Engagement, Sizzle Reel) with the *prices she set last quarter, not the ones from 2 years ago*. She scrolls the preview — it looks identical to the Canva PDF she used to pay $30/month for. She hits Send.

**Climax.** Tuesday at 2pm, Sarah's phone buzzes again: *"Mike & Jenny accepted — selected Full Coverage + Engagement Video — total $5,200. Draft contract ready for review."* She opens Slate. A draft contract is sitting in her queue: master Wedding Contract template, with the right clauses showing because they picked an Engagement Video, the music-licensing clause appearing because that's tied to Engagement Video, the deposit calculated as 30% = $1,560. She reads it through. She knows this contract — she wrote it once and Slate has assembled it perfectly. She hits **Approve & Send**.

**Resolution.** Wednesday morning, Sarah wakes up to: *"Mike & Jenny signed. Stripe deposit $1,560 received. Project moved to Booked."* The wedding is now a project on her calendar with a payment schedule and a client folder ready to go. She never opened HoneyBook. She never opened Canva. She had two clicks of admin work in three days. Total time: under 4 minutes.

**Emotional truth.** She *trusts the system to do her admin while she does the craft*. The new chapter is one where ops doesn't rob her of editing time.

**Capabilities revealed.**
- Public contact form with embed snippet
- Lead notification via iMessage and email
- Leads as a stage in existing Pipeline
- Lead-to-proposal one-click flow with pre-fill from lead data
- Block-based proposal renderer at PDF parity
- Reusable Packages auto-attached to proposal templates
- Selectable packages on public proposal viewer with live total
- Auto-generated draft contract on acceptance
- Owner approval gate before send
- Stripe deposit billing at signing
- Auto-promotion from Lead → Proposal Sent → Contract Signed → Project

### Journey 2 — Sarah, Edge Case (Declining a Bad-Fit Lead)

**Opening Scene.** Same Sarah, different inquiry. The contact form lands: a corporate event at a large convention center, not her style, not her pricing range. The notes say "Looking for $500 budget for a 3-hour shoot."

**Rising Action.** She clicks the lead card, glances at it, and clicks **Decline**. A dialog: *"Send a polite decline email?"* with a pre-written friendly template ("Thanks so much for reaching out. Unfortunately my schedule and pricing don't align with your project — I'd recommend trying [referral list] for what you're looking for."). She edits one sentence to add a referral. Hits send.

**Resolution.** Lead is moved to **Archived/Declined**. The Pipeline doesn't show it on her main view. The decline email goes out. Total time: 30 seconds. The bad-fit lead doesn't pollute her pipeline analytics.

**Capabilities revealed.**
- Decline-with-email path on Lead cards
- Pre-canned decline templates with merge fields
- Archive/Declined lead state separate from active pipeline
- Pipeline analytics that exclude declined leads from conversion calculations

### Journey 3 — Maria, First-Time Slate User Setting Up Her First Inquiry

**Opening Scene.** Maria is a 26-year-old senior portrait photographer in Phoenix. She has 14 paying clients per year and uses a shared Google Doc for "contracts" and Venmo for deposits. She heard about Slate from another photographer in a Facebook group. She signs up. It's Day 1.

**Rising Action.** Slate's first-run wizard meets her at the Templates Hub. Three steps:
1. *"Create your first Package."* It shows an example ("Senior Portrait Session — $300, 20 edited images, online gallery"). She edits the price and description. Done.
2. *"Build your first proposal template."* It shows three starter templates she can clone — including "Senior Portrait Proposal" pre-filled with a hero image placeholder, her package, and the standard senior-portrait copy. She clicks Clone, swaps the hero image with one of her own, hits Save.
3. *"Embed your contact form."* Slate gives her a 4-line snippet to paste into Squarespace. She follows the inline instructions, pastes it, refreshes her site, sees the form live. The wizard celebrates.

**Climax.** Two days later, an inquiry hits. Maria's phone buzzes — Kevin's iMessage. She opens Slate, sends the proposal, and 6 hours later signs her first contract through the system. Deposit lands in her Stripe account. She closes her laptop and stares at the wall for a minute. She had been doing this manually for two years.

**Resolution.** Maria texts the photographer who referred her: *"This actually replaced my whole HoneyBook. I had a contract and deposit done in a week and I haven't touched a Google Doc."*

**Emotional truth.** First-time users need to feel competent in 15 minutes, not overwhelmed by an empty canvas. The wizard + starter templates make the abstraction concrete.

**Capabilities revealed.**
- First-run setup wizard (3 steps)
- Starter templates gallery (clone-and-edit)
- Clear contact form embed instructions with copy-to-clipboard snippet
- Inline help text explaining what Packages, Proposals, Contracts mean
- Empty-state dashboards that prompt next action

### Journey 4 — Mike & Jenny, the Couple (Public-Facing Client)

**Opening Scene.** Mike & Jenny are an engaged couple, 18 months out from their wedding. They've been comparing 4 videographers on Instagram. Sarah's portfolio caught their eye. They click "Get a Quote" on Sarah's website at 11pm one Saturday. The form is simple — name, email, phone, date, venue, a paragraph for "tell us about your day." They submit.

**Rising Action.** Sunday morning at 8am they get an email: *"Hey Mike & Jenny — thanks for reaching out about your June 14 wedding at Front Porch Farms. Here's a proposal customized for your day."* They click. The proposal opens in their browser — full-bleed cover image of a wedding Sarah shot at the same venue, "Congratulations on Your Wedding Day!" in gorgeous serif. They scroll. Three packages with photos, prices, and checkboxes. They tick Full Coverage and Engagement Video, leave Sizzle Reel unchecked. The total updates to $5,200 in real time. They scroll to the bottom — a single "Accept & Continue" button.

**Climax.** They click Accept. A confirmation page: *"Sarah will review and send your contract for signature within 24 hours."* They feel like they've made a decision, not done paperwork. Tuesday afternoon, they get a contract email. They click, read, sign their names on the canvas, hit Submit. A Stripe Checkout opens for $1,560. They tap Apple Pay. Done. They get a receipt + a copy of the signed contract as a PDF.

**Resolution.** They text each other: *"That was so easy."* Their wedding is booked. They don't think about the operational layer at all.

**Emotional truth.** Clients shouldn't experience operations — they should experience confidence in their vendor. The pipeline that's complex on Sarah's side is *invisible* on the client side.

**Capabilities revealed.**
- Public proposal viewer with selectable packages and live total
- One-click acceptance flow (no account creation required)
- Public contract signing with canvas signature
- Stripe Checkout for deposit, Apple/Google Pay supported
- Auto-emailed receipts and signed-PDF copies for client records
- Mobile-responsive everything (most clients view on phone)

### Journey 5 — David, Studio Owner Delegating to His Producer

**Opening Scene.** David runs a 4-person video production studio. Himself (owner), 1 producer (Anna), 2 editors. He's been running every inquiry himself for years and is burning out on admin during peak season — proposals are stacking up unsent because he's also editing.

**Rising Action.** David opens Slate, goes to Settings → Team → Anna, and toggles on **"Can draft & send proposals"** and **"Can edit draft contracts."** He leaves **"Can approve & send contracts"** off — that's his decision still. The next morning, three new leads come in. Anna sees them in the Pipeline (a new sidebar section appeared for her overnight). She drafts proposals using David's master templates and Packages, adjusts a couple of prices for clients she's been emailing back and forth with, and sends them. Two clients accept by lunchtime. Slate auto-generates draft contracts and routes them to David's queue with a yellow "Awaiting your approval" badge.

**Climax.** David opens one — the conditional "out-of-state travel" clause didn't fire because Anna typed the venue as "Atlanta" without the state code. He edits the city, the travel-fee clause auto-appears, the deposit math updates. He approves and sends. The contract goes out for signing. He pings Anna in Slack: *"Atlanta needs TN or GA on the venue field or the travel conditional doesn't trigger — quick fix for next time."*

**Resolution.** Two weeks in, David has approved 8 contracts. He hasn't drafted a single proposal. Anna has become the front line; David is the gate. He can edit; she can drive the inflow. They each do half what they used to do alone, the work goes faster, and the master templates stay locked to David's standards.

**Emotional truth.** Small studio owners aren't trying to micromanage — they're trying to stop being the bottleneck. The toggles let them delegate execution while keeping the business configuration (pricing, contract language, brand) under their sole control.

**Capabilities revealed.**
- Per-user toggles for delegation (4 of them: lead triage, proposal drafting+sending, contract draft editing, contract approval+sending) — off by default, granted individually
- Owner-only by default for Packages, proposal templates, master contracts, contact forms (never delegate-able)
- Pipeline visibility extends only to users with relevant toggles — staff without toggles don't see the Lead/Proposal/Contract-draft stages at all
- Activity attribution per user (Anna sent the proposal, David approved the contract — visible audit log)
- Conditional contract sections sensitive to data quality (travel-rate trigger)
- Settings → Team page where toggles are managed; toggle changes audit-logged

### Journey Requirements Summary

The five journeys reveal the following capability buckets the system must deliver:

**Lead capture & routing**
- Embeddable public contact form
- Lead notifications (iMessage via Kevin + email)
- Leads as a stage in existing Pipeline
- Decline-with-email path
- Pipeline analytics that exclude declined leads

**Template authoring**
- Block-based proposal templates with hero/prose/package-row blocks
- Master contract templates with conditional sections (always / if-package / if-not)
- Reusable Packages with curated icon set + R2 image upload
- Starter templates gallery for cloning

**Proposal & client experience**
- Lead-to-proposal one-click flow with auto-fill
- Public proposal viewer with selectable packages and live total
- One-click acceptance (no client account)
- Mobile-responsive client surfaces

**Contract auto-generation & approval**
- Auto-generated draft contract on proposal acceptance
- Conditional sections evaluated against client selections + data
- Owner approval gate before client send
- Editable contract draft for last-minute corrections

**Billing**
- Stripe deposit calculated from contract template's deposit rule
- Stripe Checkout at signing with Apple/Google Pay
- Webhook-based deposit reconciliation
- Graceful failure (signing not blocked by deposit failure)

**Onboarding & team**
- First-run setup wizard for new users
- Role-based access (owner/producer/editor/staff)
- Per-user activity attribution

## Domain-Specific Requirements

### Compliance & Regulatory

- **ESIGN Act + UETA (electronic signatures).** Auto-generated contracts that get signed via Slate's signing flow must capture the same evidence as the existing contract module: signer's typed/drawn signature, IP address, timestamp, the exact contract content as rendered at signing time. Slate already does this for hand-built contracts; auto-generated contracts inherit the same `useSignatureCanvas` hook + audit trail.
- **PCI-DSS.** Slate never touches card numbers. Stripe Checkout handles the deposit flow; Stripe's hosted payment page keeps Slate at SAQ-A (lowest tier) compliance scope. The new deposit-at-signing logic must continue to use Checkout sessions on the connected Stripe account, never raw card endpoints.
- **CCPA / state privacy laws.** Public contact forms collect name, email, phone, event date, venue. Slate's existing privacy policy covers customer data; the new public form must:
  - Display a one-line privacy notice with link to the customer's privacy policy
  - Honor a "do not sell" data signal (Slate doesn't sell, so default-compliant)
  - Allow leads to request deletion via support email
- **Contract retention.** Signed contract PDFs must be retained for at least 7 years (typical statute of limitations for contract disputes). Slate already retains signed PDFs in R2 indefinitely; no change needed.

### Technical Constraints

- **Cross-tenant isolation (RLS).** Every new table (`packages`, `contact_forms`, `leads`, `proposal_blocks`, `contract_template_clauses`) must enforce `org_id = public.user_org_id()` in its RLS policy. Verified via `pnpm test:rls` after each migration.
- **Public-form abuse mitigation.** The contact form endpoint is unauthenticated by design. It must:
  - Rate-limit by IP via Upstash Redis (already wired for other endpoints): 10 submissions/IP/hour.
  - Reject obvious spam (link-only bodies, all-caps, known spam patterns) at the API layer.
  - Optional: Cloudflare Turnstile (captcha) on forms with high spam volume — defer until needed.
- **Deposit-billing failure isolation.** Stripe Checkout failures at signing must not block the contract from being signed. Architecture: client signs first, contract is marked signed in DB, then Slate creates the Checkout session and emails the client a payment link. Webhook reconciles the payment-paid state. Existing Stripe webhook handler already supports this.
- **Public-form spam doesn't pollute analytics.** Leads must have a "spam" filter state separate from "declined" — auto-detected spam goes to a hidden bucket, not the active pipeline.

### Integration Requirements

- **Stripe Connect.** Deposit billing routes to the customer's connected Stripe account (existing pattern: `stripe_account_id` on `organizations`). Platform Stripe key is used to create Checkout sessions ON behalf of the connected account.
- **Resend (transactional email).** New emails sent in this work: lead confirmation to client, proposal email to client, contract-signing email to client, contract-signed receipt to client and owner, deposit-paid receipt. All use existing Resend integration.
- **Kevin (iMessage bridge).** Lead notifications route through Kevin's email-scanner intake (`mail.sdubmedia.com` → Kevin → iMessage to Geoff). Other users' notifications use their configured channel (default: email only; iMessage path is Geoff-specific). General users get email notifications by default.
- **R2 (Cloudflare object storage).** Hero images on proposal blocks and Package photos upload to the existing `slate-deliveries` bucket under a new `proposals/{orgId}/` prefix. Same auth + signed-URL pattern already used by Galleries.

### Core Architectural Principles

These two principles cut across every feature in this PRD and govern how data flows between Packages, Proposals, and Contracts.

#### Principle 1: Pin-by-default

Every document Slate sends out is **frozen at the moment of send**. Master Packages and Master Contracts are **library entries** — editing them never auto-affects work that has already been sent or generated.

- **Packages → Proposals:** When a Package is added to a proposal (manually or via auto-attach from a template), the Package's name, icon, description, and `default_price` are *copied* into the proposal as line-items. Editing the master Package later doesn't change the proposal.
- **Proposals → Sent state:** Once a proposal is sent, the prices, copy, and packages on it are frozen. Editing a master Package or master template afterwards does NOT propagate to sent proposals.
- **Master Contracts → Draft Contracts:** When a draft contract is auto-generated from client acceptance, the master contract template's content is *snapshotted* into the draft. Editing the master contract template later doesn't auto-update pending drafts.
- **Opt-in upgrade path:** A draft contract has a "Regenerate from latest master" button. Clicking it discards the current draft and re-generates from the current master template. Owner-initiated, never automatic.
- **Implementation note:** Each generated contract record stores `master_template_version_id` so an audit trail exists for which version of the master produced this contract.

#### Principle 2: Per-proposal price overrides

The Package library is **the default**, not the law. The owner can adjust prices on any individual proposal before sending without touching the master Package.

- **Default-prefilled:** When a proposal is created, all package prices come from the Package library's `default_price`.
- **Editable on the draft:** Before clicking Send, the owner can override any line-item's price (raise, lower, set to zero, add a discount note). Edits apply only to this proposal.
- **One-click send remains the happy path:** No adjustment is required. If the owner doesn't touch any prices, the proposal sends at default prices. Adjustment is opt-in friction available when needed.
- **Pinned at send:** Once sent, the proposal's prices are locked. The same Pin-by-default principle applies — even if the owner later changes the master Package's `default_price`, the sent proposal still shows what was sent.
- **Owner can adjust the discount note inline:** "Originally $3,500, discounted to $2,800 for off-season" displays as the strikethrough-from price the Wedding Proposal PDF shows.

### Risk Mitigations

#### Risk 1: Auto-generated contract has wrong clauses

1. **Visible rule-firing log on the approval screen.** Sidebar shows: *"Music Licensing clause is included because the client selected Engagement Video. Travel Fee section is included because the venue is more than 1 hour from Palmdale, CA."* No black box.
2. **Clause-level toggle.** Every conditional clause has a checkbox in the approval view. Owner can override the rule for this specific contract without touching the master template.
3. **Preview-anything mode.** From the contract template editor, owner clicks "Preview" → picks a hypothetical package combo → sees the exact contract that would render. Owner can save named scenario fixtures ("3 standard wedding combos I always run") and re-test them every time the master changes.
4. **Snapshot at signing time.** The exact rules that fired + the exact rendered HTML get saved with the contract record at the moment of client signature. Audit trail for legal disputes.
5. **CI-level rule fixtures pinned to master version.** Every conditional rule gets a unit test with deterministic fixtures pinned to a specific master template version. Adding a new rule requires adding the fixture. Rule regressions are blocked at PR time. Versioning is decoupled from rule-engine logic.
6. **Pin-by-default architecture (see Principle 1).** Master template edits never auto-propagate to draft contracts. Only the explicit "Regenerate from latest master" button changes a draft after generation.

#### Risk 2: Contact form filled with garbage

1. **Honeypot field.** Hidden form field that real humans never see/fill. Bots fill it. Submissions with the honeypot populated are silently dropped.
2. **Cloudflare Turnstile.** Invisible captcha (no Google tracking) on every public form. Threshold-based — only triggers visible challenge if signal is suspicious.
3. **Auto-pause threshold per form.** If a form gets >10 submissions per IP per hour OR >50 submissions total per hour, the form auto-disables and emails the owner. One-click re-enable.
4. **Lead quality scoring.** Heuristic: missing required fields, generic email patterns, no name capitalization, link-only message body → submission lands in a "Review" bucket separate from active pipeline. Owner sees and clicks one button to keep or discard.
5. **Per-form domain/IP blocklist.** Owner can block specific domains or IPs (e.g., a competitor scraping prices). Rule-based, not ML.

#### Risk 3: Client accidentally accepts a proposal

1. **Two-step accept with explicit language.** Modal: *"You're saying you want **Full Coverage Wedding ($3,500)** and **Engagement Video ($1,500)** for a total of **$5,200**. Sarah will review and send your contract within 24 hours. Are you sure?"* Cancel + Confirm.
2. **1-hour undo window.** Acceptance email includes "Made a mistake? [Undo my acceptance]" link. Click reverts the proposal to *Sent* and notifies the owner.
3. **Owner approval is the real safety net.** Even if the client accepts in error, no contract is sent without the owner clicking Approve. Owner sees the accepted-then-undone state in the Pipeline.
4. **Mobile-friendly accept controls.** Buttons sized for phones; no easy mis-taps.

#### Risk 4: Payment fails at signing

1. **Decoupled architecture.** Client signs → contract is *signed* in DB → then Stripe Checkout opens. Signature isn't blocked by payment.
2. **Auto-retry with fresh Checkout link.** On failure, send the client an email with a fresh Checkout URL. Up to 3 retries before owner is notified.
3. **Per-contract deposit-status field.** Owner sees on the contract card: *Signed but Deposit Pending* (yellow) vs *Signed & Paid* (green). Aging indicator after 24 hours.
4. **Multiple payment methods in Checkout.** Apple Pay, Google Pay, Card, Link, ACH. All enabled in Checkout session config.
5. **Owner-configurable SLA.** "Email me if a deposit hasn't been paid X hours after signing." Default 24 hours.
6. **Webhook idempotency.** Stripe webhook handler keys on `payment_intent.id` so retries don't double-charge or double-mark-paid.

#### Risk 5: Owner forgets to approve a draft contract

1. **Aging indicator with color states.** Green <24h, yellow 1–3 days, red >3 days. Visible on the Pipeline card and dashboard.
2. **Daily digest email at 9am.** "You have 3 contracts pending approval. Oldest: 5 days." One click into Slate.
3. **iMessage nudge for Geoff specifically.** Day-2 ping. Other users get email; iMessage path is opt-in per user.
4. **Auto-reminder to client.** When the proposal is accepted, client gets *"Sarah will review and send your contract within 24 hours."* After 48h, *"Still working on it — you'll have it by [date]."* Owner-customizable.
5. **Owner-configurable auto-send (opt-in, off by default).** "After X days of approval delay, auto-send the contract as-is." For owners who trust their templates and don't want to be the bottleneck.
6. **Single "Needs Attention" dashboard widget.** Counts pending leads, pending approvals, overdue deposits, signed-not-paid. One click to triage.

#### Risk 6: Slate downtime drops a real lead on the floor

1. **Idempotent form submission with retry on the client.** The embedded form retries failed submissions up to 5 times with exponential backoff before showing an error.
2. **localStorage backup on the client.** Form data is stored in `localStorage` until the server confirms receipt. If the client closes the tab during a transient error, the next page load shows *"You started filling out a form — restore?"*.
3. **Sentry on the submission endpoint.** All 5xx errors page Geoff (or whoever's on call). Public form submission is a P0 endpoint.
4. **Synthetic monitoring.** Cronitor pings the form endpoint every 5 minutes; failures alert immediately.
5. **Form fallback to email.** If the API repeatedly fails, the form auto-falls-back to a `mailto:` link with the form contents pre-filled. Worst case, lead lands in the owner's inbox manually.

#### Risk 7: A bug during wedding season is catastrophic

1. **Phase rollout starts on Geoff's account only.** New features ship behind a feature flag scoped to `org_id = sdubmedia`. Geoff drives them in production for 2 weeks before any other customer sees them.
2. **Existing flow preserved during entire rollout.** Old proposal templates, old contract editor, old Pipeline all continue to work. New code is additive, not replacing — old templates keep rendering via legacy renderer until manually migrated.
3. **Documented rollback plan per phase.** Before any phase ships, the rollback procedure is documented (which feature flags to flip, which DB rows to revert). Tested in dev.
4. **No phase ships in May–Sep without explicit Geoff approval.** Wedding season blackout convention. Bug fixes only.
5. **Pre-launch smoke test.** End-to-end test runs the full Sarah journey (form → proposal → accept → contract → sign → pay) against a staging org before each phase ships to production.
6. **Sentry + Cronitor coverage extended.** All new endpoints (lead-submit, proposal-accept, contract-generate, deposit-charge) wrapped in error reporting + uptime monitoring.

## SaaS B2B Specific Requirements

### Project-Type Overview

The Templates & Inquiry Pipeline is delivered as a feature surface inside the existing Slate SaaS web app (`slate.sdubmedia.com`). It operates within Slate's established multi-tenant model, paid subscription tiers, and integration ecosystem. **Owner-administered by default**, with per-user toggle delegation to support small teams. No new authentication primitive, no new tenancy model, no new payment infrastructure.

### Multi-Tenancy (Tenant Model)

- Every new table (`packages`, `proposal_blocks`, `contact_forms`, `leads`, `contract_template_clauses`, `contract_template_versions`) carries `org_id text NOT NULL DEFAULT ''` with RLS policies enforcing `org_id = public.user_org_id()`.
- No cross-tenant data flows. A Package built by one org cannot be viewed, cloned, or referenced by another. (Future "starter templates gallery" is the only exception — platform-owned, read-only.)
- Public-facing endpoints (form submission, public proposal viewer, public signing) use token- or slug-based access — never service-role exposure.
- `pnpm test:rls` extended with each new table; passes before any phase ships.

### Role-Based Access Control (RBAC)

**Owner-only forever (no toggle exists):**
- Master Packages — create, edit, delete
- Master proposal templates — create, edit, delete
- Master contract templates — create, edit, delete (legal language, conditional rules, deposit rules)
- Contact forms — create, edit, delete, embed snippet generation
- Subscription, billing, and integration settings

**Per-user toggleable (off by default, owner grants per individual user):**

| Toggle | Grants the ability to |
|---|---|
| **Lead triage** | View incoming leads, decline a lead, mark as spam, edit lead detail fields |
| **Proposal drafting & sending** | Create a proposal from any template, edit any line-item price for that proposal, hit Send |
| **Contract draft editing** | Edit an auto-generated draft contract (typo fixes, scope tweaks). Cannot click Approve & Send. |
| **Contract approval & sending** | Click Approve & Send on a draft contract — releases it to the client for signature |

Each toggle is independent. An owner can grant any combination — e.g., grant Anna lead triage + proposal drafting/sending, but withhold contract editing and approval.

**Other roles (partner, family, client) — none of these toggles are available.** Clients still get the public-facing surfaces (proposal viewer, contract signing, deposit pay) by definition; partners and family see no part of the inquiry pipeline.

**Sidebar visibility.** The new Templates Hub, Packages, Contact Forms, and Master Contract Template nav items appear only for `role === 'owner'`. The Lead/Proposal/Contract-draft Pipeline columns appear for the owner and any user with at least one toggle enabled. Users with zero toggles don't see the new Pipeline stages at all.

**Toggle management.** Settings → Team → click a user → "Inquiry Pipeline Access" section with the four toggles. Defaults all off. Every toggle change is audit-logged with timestamp + acting user.

### Subscription Tiers

| Capability | Free | Basic ($9.99/mo) | Pro ($19.99/mo) |
|---|---|---|---|
| Block-based proposal templates | ✅ | ✅ | ✅ |
| Number of saved Packages | 3 | 25 | unlimited |
| Number of proposal templates | 1 | 10 | unlimited |
| Master contract templates with conditional clauses | ❌ | ✅ | ✅ |
| Embeddable contact forms | ❌ | 1 form | unlimited forms |
| Lead notifications (email) | ✅ | ✅ | ✅ |
| Lead notifications (iMessage via Kevin) | ❌ | ❌ | ✅ |
| Auto-generated draft contracts | ❌ | ✅ | ✅ |
| Stripe deposit billing at signing | ❌ | ✅ | ✅ |
| Per-user toggle delegation (Team plans) | ❌ | up to 3 toggled users | up to 10 toggled users |
| Custom SVG icon upload (Growth) | ❌ | ❌ | ✅ |
| Onboarding wizard + starter templates | ✅ | ✅ | ✅ |

Pro becomes the "I'm replacing HoneyBook" tier with iMessage notifications and team delegation. May justify a future **Pro+ ($29-39/mo)** tier when AI-assisted features ship in the Vision phase.

Tier checks integrate with existing `OrgFeatures` JSONB on the organization row. Limits enforced both at API (server-side, source of truth) and UI (graceful upgrade prompts, not blank failures).

### Integration List

- **Stripe Connect** (existing) — deposit billing through customer's connected account.
- **Stripe Webhooks** (existing) — payment-paid + payment-failed reconciliation.
- **Resend** (existing) — new email types: lead confirmation, proposal sent, contract awaiting signature, contract signed receipt, deposit paid receipt, deposit failed retry, lead-aging digest.
- **Cloudflare R2** (existing — `slate-deliveries` bucket) — new prefix `proposals/{orgId}/` for hero images and package photos.
- **Cloudflare Turnstile** (new) — invisible captcha on public contact forms.
- **Upstash Redis** (existing) — extended to public form submission rate limiting.
- **Sentry** (existing) — extended to all new public endpoints + the contract-generation engine.
- **Cronitor** (existing) — new monitors for lead-submit, proposal-accept, contract-generate, deposit-charge endpoints + form-endpoint synthetic ping.
- **Kevin (iMessage)** — Geoff-only path; other Pro users get email-only by default. iMessage opt-in is a separate plumbing project.

No new authentication providers, payment processors, email senders, or storage backends.

### Compliance Requirements

Detailed in the Domain-Specific Requirements section above. Summary: ESIGN/UETA inheritance, PCI-DSS SAQ-A scope via Stripe Checkout, CCPA-compliant public form data collection, 7-year contract retention via existing R2.

### Implementation Considerations

- **Code organization** follows Slate's established `CLAUDE.md` patterns: pages under `client/src/pages/`, API endpoints under `api/*.ts` with `.js` ESM imports, `verifyAuth()` for auth, token-based for public routes, `errorMessage(err, fallback)` for error normalization.
- **State management** flows through `AppContext.tsx` — every new entity gets type definition, row converter, fetch query, CRUD callbacks, and context exposure per the existing 11-step add-entity recipe.
- **Realtime** subscriptions extend existing pattern — Lead inserts trigger Pipeline updates without manual refresh.
- **Mobile surface** — public proposal viewer, signing surface, and Stripe Checkout must work flawlessly at 375px (existing CLAUDE.md rule). Owner-side mobile editor is read-mostly + edit-as-needed for v1; full mobile editor parity is Growth.
- **Database migrations** follow Slate's manual-migration convention with paste-able SQL blocks and rollback files.
- **Skipped per CSV:** `cli_interface` and `mobile_first` as a primary design driver. Mobile is "must work," not "must lead."

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Approach: Problem-Solving MVP with two-checkpoint behavioral validation.** The MVP exists to prove one binary claim, and we measure it at two distinct checkpoints rather than one big-bang at the end:

- **Checkpoint A (mid-summer 2026):** Geoff stops opening HoneyBook for *new inquiries*. Inquiry intake and proposal sending all happen in Slate. He still uses HoneyBook for contracts and deposits.
- **Checkpoint B (October 2026):** Geoff stops opening HoneyBook *entirely* for the inquiry-to-deposit pipeline. Contracts and deposits also flow through Slate.

Two-checkpoint framing protects against post-season relief contaminating the success metric, gives us behavioral validation during peak wedding season (best dogfood test possible), and lets us catch fundamental flaws earlier without waiting for a big-bang launch.

**Resource model.** Solo developer (Geoff with Claude assist). Small commits, feature-flagged rollouts to Geoff's org first, then progressive customer expansion. No team to coordinate; no parallel workstreams. Scope must respect the bottleneck.

### MVP Sub-Phasing — Sequenced for Risk Profile

**Pro-dev sequencing decision: 1A → 1D → (1B+1C paired)**, *not* the original 1A → 1B → 1C → 1D. The new order ships two standalone wins to Geoff during summer and lets the high-complexity work happen post-season.

```
1A (proposal templates) ──┐
                          ├── (independent — both ship as standalone wins by mid-summer)
1D (forms + leads)  ──────┘
1B (packages + master contracts) ── 1C (auto-gen + deposit) ── (paired delivery, ships fall)
```

Why pair 1B + 1C: the conditional-clause engine in 1B has zero user-facing surface until 1C consumes it. Building one without the other yields dead code or fake demos. They validate together.

### Sub-Phase 1A — Block-Based Proposal Templates

**Target ship:** End of May 2026 (~1–2 sessions of work).

**What ships:** Replace the textarea editor in `TemplateEditorPage` with a block stack including hero, prose, package row, divider, signature, spacer, image, and centered-title blocks. Renderer is shared across editor preview, in-app proposal view, and public proposal viewer (no drift). Hero images and inline images stored on R2. Old templates with raw `content` strings continue to render via a legacy block fallback. Owner-side R2 image upload endpoint.

**Definition of done:**
- New block-based editor renders the existing Wedding Day Proposal PDF at visual parity
- Old templates still render correctly via legacy fallback (zero migration required)
- Public viewer renders identically to in-app preview (single shared renderer)
- R2 image upload works end-to-end with signed URLs

**Kill criterion:** If R2 integration takes more than 1 session, fall back to inline data URLs (≤500KB hero images) and ship. R2 migration becomes a 2-week follow-up.

**Validates Checkpoint A toward:** "renders proposals correctly."

### Sub-Phase 1D — Embeddable Contact Form + Leads + Notifications

**Target ship:** End of June 2026 (~3–4 sessions).

**What ships:** Public contact form embeddable into customer websites via JS snippet. Leads land as a new stage in the existing Pipeline. Lead notifications via email (always) and Kevin iMessage (Geoff-only path). Anti-abuse: Cloudflare Turnstile, honeypot field, Upstash Redis rate limiting, auto-pause threshold per form. Multi-form schema built (`contact_forms` table supports unlimited forms per org), but UI surface restricted to one form per org for MVP.

**Decisions baked in:**
- **Schema-first, UI-gated.** `contact_forms` table is built for multi-form support; MVP UI just hides the "Add another form" button. Phase 2 unhides it. Zero migration cost later.
- **Per-org email override table** (`org_email_overrides`) ships in 1D. Geoff WILL hit "Sarah will review and send your contract within 24 hours" wanting to rewrite that text on Day 1. Hardcoded strings are not acceptable. UI: Settings → Email → list of email types with [Edit] button → textarea + merge-field chip row.
- **Per-user toggle schema in, UI out.** `user_inquiry_pipeline_permissions` table created in MVP. Owner is implicitly granted all four toggles via `role === 'owner'` check (no rows needed in MVP). All other users implicitly denied. Phase 2 builds the Settings → Team UI; transitioning the auth check is a 1-day change.

**Definition of done:**
- Geoff has had at least 1 real inquiry come in via his website-embedded form
- The lead landed in the Pipeline as a Lead card
- He got both an email and a Kevin iMessage notification
- Cloudflare Turnstile rejected at least 1 simulated bot submission

**Kill criterion:** If Cloudflare Turnstile integration takes more than 1 session, ship without it (rate-limit + honeypot only). Turnstile becomes a 2-week follow-up. Form remains protected by rate limiting + honeypot in the gap.

**Validates Checkpoint A toward:** "intake handled in Slate, not HoneyBook."

### Sub-Phase 1B + 1C — Packages + Master Contracts + Auto-Generation + Deposit Billing (Paired)

**Target build:** July–September 2026 (~8–10 sessions, runs parallel to wedding-season editing work).

**Target ship to Geoff's org:** October 2026 (post wedding-season blackout).

**What ships in 1B (the foundation):**
- New Package entity (CRUD, curated Lucide icon picker, R2 image upload, default price + deliverables list)
- Per-proposal price overrides (Package default → editable per proposal → frozen at send)
- Master contract templates extended with conditional-clause system (always-show / show-if-package-selected / show-if-not-selected)
- Pin-by-default architecture across both Packages → Proposals AND master contracts → draft contracts
- Contract template versioning + "Regenerate from latest master" opt-in button on draft contracts

**What ships in 1C (the consumer):**
- Public proposal viewer gains checkboxes per package and live-total calculator
- Acceptance flow: client selections trigger auto-generation of a draft contract from the chosen master template
- Conditional-clause engine evaluated against selections + lead data at acceptance time
- Owner approval queue with visible rule-firing log + clause-level toggles + clause-level edit
- Stripe Checkout deposit billing kicks off at signing (decoupled architecture: client signs → DB marks signed → Checkout opens → webhook reconciles)
- Per-contract deposit-status field with aging indicator
- Auto-retry email path for failed deposit charges

**Definition of done (paired):**
- Geoff has run a real end-to-end inquiry through Slate without leaving the system: contact form → lead → proposal sent → client accepts with package selections → draft contract auto-generated → Geoff approves → client signs → Stripe charges deposit → project moves to Booked stage
- Conditional-clause engine passes 100% of deterministic fixture tests
- All seven measurable-outcome latency targets in the Success Criteria section are met

**Kill criterion:** If by August 31, 2026 the conditional-clause engine fails deterministic fixture tests, descope to non-conditional master contracts (manual merge fields only). Ship the deposit-billing path on top of merge-field-only contracts. The conditional engine becomes Phase 2 work. This protects Checkpoint B's October ship date.

**Validates Checkpoint B toward:** "Slate runs the entire pipeline end-to-end."

### Phase 2 — Growth Features (Post-MVP, Q1 2027 onwards)

What turns the MVP into a credible HoneyBook replacement for new customers, not just for Geoff. No wedding-season pressure since this builds in Q1 2027.

- **Per-user toggle UI** — Settings → Team → click a user → "Inquiry Pipeline Access" with the four toggles. Schema already exists from MVP; this lifts the gate.
- **Multi-form per org UI** — lift the 1-form gate from MVP. Schema already exists.
- **Templates Hub navigation** — one section under Settings/sidebar gathering Proposals, Contracts, Packages, Contact Forms, Email Templates. Replaces scattered current nav.
- **First-run onboarding wizard** — 3-step setup for new users (closes Journey 3).
- **Starter templates gallery** — pre-built clones of Wedding Proposal, Family Session Master Contract, FOMO Edit Contract, Toast Edit Contract, Engagement Day Contract.
- **Custom SVG icon upload** — beyond the curated Lucide set.
- **Conditional rules on proposal blocks** (not just contracts) — show Engagement Video page only if package is in the offered set.
- **Package conversion analytics** — which packages attach most often to accepted proposals.
- **Email template library inside Slate** — rich-text editor for the email overrides shipped in 1D, plus customer-defined automation triggers.

### Phase 3 — Vision (Q4 2027+, exploratory)

- AI-assisted proposal generation
- Questionnaires for pre-call qualification (HoneyBook smart-files parity)
- Workflow automations
- Scheduled sends
- Community marketplace of starter templates
- Multi-language proposals/contracts (Spanish first)

### Realistic Timeline

| Window | Activity |
|---|---|
| May 2026 | 1A locally + behind feature flag; Geoff dogfoods rendering fix |
| June 2026 | 1D ships; Geoff captures real inquiries via embedded form on his website |
| Mid-summer 2026 | **Checkpoint A measured** — does Geoff use Slate's new flows, even though contracts still go through HoneyBook? |
| Jul–Sep 2026 | 1B+1C build — heavy work during wedding season but only Geoff's org sees feature flags; no other-customer risk |
| Oct 2026 | 1B+1C ships to Geoff's org. **Checkpoint B begins** |
| Nov–Dec 2026 | Progressive feature-flag rollout to additional paying customers |
| Q1 2027 | MVP fully available to all paying tiers; Phase 2 work begins |

### Scope Discipline Rules

To prevent scope creep mid-build:

1. **No new entity introductions during Phase 1.** Phase 2/3 features that "would only take an afternoon" still get deferred. Scope creep is the #1 reason MVPs miss windows.
2. **No partner role access in MVP.** Even if a partner-role use case surfaces mid-build, defer it. Adds RBAC complexity without validated demand.
3. **Schema-first, UI-gated** for every "Phase 2 will be easy" feature: multi-form, custom icons, conditional proposal blocks, per-user toggle UI. Build the data model to support the future at MVP time; restrict the UI surface in MVP only.
4. **iMessage-via-Kevin path stays Geoff-only in MVP.** Other Pro users get email-only notifications. Generic iMessage notification plumbing is a separate project, deferred entirely from this PRD.
5. **Public form is one-per-org in MVP** (UI gate, schema unconstrained).
6. **No Capacitor mobile app changes.** Public client surfaces (proposal viewer, signing, payment) work mobile via responsive web. Owner-side mobile editor is read-mostly. Native push notifications deferred to RevenueCat-blocked work tracked elsewhere.
7. **Each sub-phase has an explicit kill criterion.** If a hard dependency takes longer than budgeted, descope rather than slip. Ship something lesser before slipping anything.

### Risk Mitigation by Scope Phase

**Phase 1A (lowest risk):**
- Bug fix only; ships independently; old templates unaffected via legacy fallback.

**Phase 1D (medium risk):**
- Public form is the new attack surface — all anti-abuse from Domain Risk #2 mandatory.
- Schema-first design protects future Phase 2 work from migration debt.
- Email overrides table prevents Day 1 hardcoded-string complaints.

**Phase 1B+1C (highest risk concentration):**
- Conditional-clause engine complexity: deterministic fixtures pinned to master template versions (Domain Risk #1), CI gate, Preview-anything mode in template editor.
- Brownfield Stripe Checkout integration: idempotent webhook handler keyed on `payment_intent.id`, decoupled signing/payment architecture (Domain Risk #4).
- Wedding-season blackout for *other customers*: Geoff dogfoods solo; explicit kill criterion descopes to non-conditional contracts if engine fails fixture tests by August 31.

**Cross-cutting:**
- Behavioral validation at two checkpoints rather than one big-bang launch.
- Feature flags scoped to `org_id = sdubmedia` first; no other customer sees any phase before Geoff has lived on it for 2+ weeks.
- Existing Slate test suites (`pnpm test:rls`, vitest, build) remain green throughout. Any regression is a blocker.

## Functional Requirements

### Library & Authoring (owner-only)

- **FR1:** An owner can create, edit, and delete reusable Packages, each with a name, icon (from a curated set of 12+ options), default price, optional discount-from price, optional photo, and a deliverables list.
- **FR2:** An owner can build proposal templates by stacking blocks — hero image, centered title, section divider, prose, image, package row, divider, signature, and spacer — reordering and editing each independently.
- **FR3:** An owner can attach a default set of Packages to a proposal template so they auto-appear on every proposal created from that template.
- **FR4:** An owner can create, edit, and delete Master Contract Templates composed of multiple clauses, each clause having editable rich-text content.
- **FR5:** An owner can mark each clause on a master contract as "always show," "show only if package X is selected," or "show only if package X is NOT selected."
- **FR6:** An owner can set a deposit rule on a master contract template — a fixed dollar amount, a percentage of total, or 100% paid in full.
- **FR7:** An owner can preview how a master contract would render given a hypothetical package selection, and save named preview scenarios for re-use.
- **FR8:** An owner can create, edit, and delete Contact Forms with configurable field sets and a target proposal template that determines which template a lead routes to.
- **FR9:** An owner can generate an embed snippet (HTML + JS) for a Contact Form to paste into their website.
- **FR10:** The system retains version history for master contract templates so every generated contract has an audit-traceable source version.

### Lead Capture & Pipeline

- **FR11:** A prospect can submit a Contact Form without authenticating.
- **FR12:** The system records each form submission as a Lead within 5 seconds and places it in the Pipeline's Lead stage.
- **FR13:** The system notifies the owner of a new Lead via email; an iMessage notification is additionally sent for the Geoff/SDub Media account specifically (other accounts default to email-only).
- **FR14:** A user with appropriate access can view all Leads in the Pipeline, open detail, edit any field on a Lead, decline a Lead with a customizable decline-with-email path, or mark a Lead as spam.
- **FR15:** The system excludes spam-classified Leads from active Pipeline analytics and conversion calculations.

### Proposal Lifecycle

- **FR16:** A user with the proposal-drafting permission can create a Proposal from a template, pre-filled with Lead data, owner-defined defaults, and Package default prices.
- **FR17:** A user with the proposal-drafting permission can edit any line-item price or copy on a draft Proposal before sending, without affecting the master Package or template.
- **FR18:** A user with the proposal-drafting permission can send a Proposal to a Lead/client via email.
- **FR19:** A client can view a sent Proposal at a public, token-keyed URL without authenticating.
- **FR20:** A client can select or deselect Packages on a public Proposal viewer; the total updates live as selections change.
- **FR21:** A client can accept a Proposal by submitting their selections; a confirmation modal explicitly summarizes the selections and total before submission.
- **FR22:** A client can undo an accepted Proposal within 1 hour of acceptance via a one-click email link.
- **FR23:** The system pins all Proposal prices and content at the moment of send; later edits to master Packages or master templates never alter a sent Proposal.
- **FR24:** An owner can revoke a sent Proposal before client acceptance.

### Contract Auto-Generation & Approval

- **FR25:** When a client accepts a Proposal, the system auto-generates a draft Contract from the linked master Contract Template within 30 seconds, applying conditional clauses based on the client's selections and Lead data.
- **FR26:** A user with contract-edit permission can view a draft Contract's rule-firing log showing which conditional clauses were included and why.
- **FR27:** A user with contract-edit permission can toggle individual clauses on or off on a draft Contract, and can edit clause content directly (typo fixes, scope tweaks), without affecting the master template.
- **FR28:** Only a user with the contract-approval permission can approve and send a draft Contract to the client.
- **FR29:** The system pins a draft Contract's content to the master Contract Template version it was generated from; later master-template edits never auto-affect the draft.
- **FR30:** A user with contract-approval permission can opt-in regenerate a draft Contract from the latest master Contract Template version.
- **FR31:** Every Contract is tagged with a `master_template_version_id` for audit purposes.

### Signing & Deposit Billing

- **FR32:** A client can sign a Contract at a public, token-keyed URL via canvas signature, without authenticating.
- **FR33:** The system captures signing evidence — signed timestamp, IP address, signed-content hash, and signature image — persisted with the Contract record.
- **FR34:** The system marks a Contract as signed in the database before initiating any payment flow.
- **FR35:** When a Contract is signed, the system creates a Stripe Checkout session on the customer's connected Stripe account for the calculated deposit amount, with Apple Pay, Google Pay, card, Link, and ACH enabled.
- **FR36:** The system reconciles paid deposits via Stripe webhook, updating Contract payment status idempotently keyed on payment intent ID.
- **FR37:** If a deposit charge fails, the system emails the client a fresh payment link and retries up to 3 times before notifying the owner.
- **FR38:** The system never blocks a Contract signing on a deposit-charge failure.

### Roles, Delegation & Audit

- **FR39:** Only users with role "owner" can create, edit, or delete Master Packages, master proposal templates, master contract templates, or contact forms.
- **FR40:** The system supports four per-user permissions — Lead triage, Proposal drafting & sending, Contract draft editing, Contract approval & sending — defaulting to denied for non-owner users; the per-user toggle UI ships in Phase 2 but the permission schema and enforcement ship in MVP.
- **FR41:** The role of "owner" is implicitly granted all four permissions without explicit toggle entries.
- **FR42:** The system records the acting user and timestamp on every Lead status change, Proposal sent, draft Contract approved, or Contract signed event.
- **FR43:** Permission changes (when the toggle UI ships) are audit-logged with timestamp, acting user, and target user.

### Reliability & Anti-Abuse

- **FR44:** The system rate-limits public Contact Form submissions per IP and per form, silently drops submissions with populated honeypot fields, and challenges suspicious submissions with Cloudflare Turnstile.
- **FR45:** The system auto-pauses a Contact Form when its hourly submission threshold is exceeded and notifies the owner via email.
- **FR46:** The embedded Contact Form retries failed submissions on the client side up to 5 times with exponential backoff and preserves user input in localStorage until the server confirms successful submission.
- **FR47:** The system monitors all new public endpoints (lead-submit, proposal-accept, contract-generate, deposit-charge) with synthetic uptime checks via Cronitor and reports failures to Sentry.
- **FR48:** The system surfaces aging indicators on Pipeline cards (green <24h, yellow 1–3 days, red >3 days) for pending approvals and pending deposits.
- **FR49:** An owner receives a daily digest email summarizing pending approvals, overdue deposits, and aging Leads.
- **FR50:** A "Needs Attention" dashboard widget shows live counts of pending leads, pending approvals, overdue deposits, and signed-not-paid contracts.

### Tenancy, Tiers & Email

- **FR51:** All new tables enforce row-level security on `org_id`, preventing cross-tenant data access; verified via the existing `pnpm test:rls` smoke test on every migration.
- **FR52:** The system enforces subscription-tier limits server-side on the number of saved Packages, proposal templates, and contact forms per organization.
- **FR53:** When a user attempts an action exceeding their tier, the system displays an upgrade prompt rather than failing silently.
- **FR54:** An owner can override the subject and body of every system-generated transactional email (lead confirmation, proposal sent, contract awaiting signature, contract signed receipt, deposit paid receipt, deposit failed retry, lead-aging digest) on a per-org basis, with merge-field support.

## Non-Functional Requirements

### Performance

- **NFR1:** Public Contact Form submission acknowledgment returns within 500ms (server-side processing, before any downstream notifications).
- **NFR2:** Form submission to Lead card visible in the Pipeline: under 5 seconds end-to-end.
- **NFR3:** Form submission to iMessage notification delivered to the owner: under 5 seconds.
- **NFR4:** Owner clicks "Send Proposal" → client receives proposal email: under 10 seconds.
- **NFR5:** Client accepts proposal → draft Contract appears in owner's queue: under 30 seconds.
- **NFR6:** Owner approves Contract → client receives signing email: under 30 seconds.
- **NFR7:** Client signs Contract → Stripe Checkout session opens for the deposit: under 2 seconds.
- **NFR8:** Client signs Contract → deposit charge initiated: under 60 seconds.
- **NFR9:** Public Proposal viewer first contentful paint under 1.5 seconds on Lighthouse "Slow 4G" profile (1.6 Mbps down, 750 kbps up, 150ms RTT).
- **NFR10:** Block-based proposal editor autosaves within 2 seconds of the user's last edit.
- **NFR11:** Embedded Contact Form bundle is ≤50KB gzipped to avoid degrading host websites' performance.

### Security

- **NFR12:** All new tables enforce RLS with `org_id = public.user_org_id()` — verified by `pnpm test:rls` smoke test, blocking on any failure.
- **NFR13:** Public-facing endpoints use token- or slug-based authorization; service-role keys are never exposed via public surfaces.
- **NFR14:** Public Contact Form endpoint rate-limited to 10 submissions/IP/hour and 50 total/form/hour via Upstash Redis.
- **NFR15:** Deposit billing uses Stripe Checkout sessions on connected accounts only; the system never accepts raw card data, maintaining PCI-DSS SAQ-A scope.
- **NFR16:** Contract signing captures and immutably stores: signed-content hash, signer IP address, signed timestamp, and signature image — sufficient evidence for ESIGN/UETA legal validity.
- **NFR17:** All user-supplied HTML rendered to other users is sanitized via DOMPurify with a strict allowlist of tags and attributes.
- **NFR18:** All user-supplied values interpolated into HTML transactional emails are escaped via `escapeHtml()` before interpolation.
- **NFR19:** All redirect URLs passed to Stripe (success_url, cancel_url, return_url) are validated via `isAllowedUrl()`.
- **NFR20:** Permission changes (when the per-user toggle UI ships) are audit-logged with timestamp, acting user, and target user; logs retained for the lifetime of the organization.

### Reliability & Availability

- **NFR21:** Public Contact Form endpoint targets 99.9% uptime (≤8.6 hours of downtime per year, ≤43 minutes per month).
- **NFR22:** All new public endpoints are monitored by Cronitor synthetic checks at 5-minute intervals; failures alert immediately.
- **NFR23:** All new public endpoints report errors to Sentry; 5xx errors page the on-call (Geoff during MVP rollout).
- **NFR24:** A forced 5xx from Stripe Checkout during signing leaves the Contract record with `signed_at` populated, signed-evidence persisted, and a `deposit_status` of `pending` — verified by integration test that simulates the failure.
- **NFR25:** Stripe webhook handler is idempotent — replayed events for the same `payment_intent.id` produce no duplicate charges or duplicate state transitions.
- **NFR26:** The embedded Contact Form preserves user input in localStorage and retries failed submissions up to 5 times with exponential backoff.
- **NFR27:** Application logs (Sentry, Cronitor, Vercel) are retained for ≥30 days for incident investigation.

### Data Retention & Disaster Recovery

- **NFR28:** Signed Contracts and their evidence (signature image, IP, timestamp, content hash) are retained for 7 years from contract end-date and never auto-purged before then.
- **NFR29:** Declined leads, spam-classified leads, and undone-acceptance leads auto-purge after 90 days unless explicitly pinned by the owner.
- **NFR30:** Active leads, sent proposals, and active projects retained for the lifetime of the organization (no auto-purge).
- **NFR31:** Backup/Disaster Recovery: Recovery Point Objective (RPO) ≤ 24 hours, Recovery Time Objective (RTO) ≤ 4 hours, achieved via Supabase Pro daily automated backups + the existing Slate-side backup cron (3am UTC daily, retained per the existing schedule) + R2 cross-region replication for media assets.

### Scalability

- **NFR32:** Initial deployment load (~10 paying orgs × ~50 inquiries/month = ~500 leads/month) fits within current Vercel + Supabase Pro tier capacity with margin.
- **NFR33:** Growth scenario (12-month: 100 paying orgs × ~100 inquiries/month = ~10,000 leads/month) fits within current infrastructure tier without re-architecture.
- **NFR34:** Stretch scenario (24-month: 1,000 paying orgs × ~100 inquiries/month = ~100,000 leads/month) approaches Supabase row-count and Vercel concurrency limits but requires only vertical tier upgrades, not architectural changes.

### Browser Support

- **NFR35:** Public client surfaces (Proposal viewer, Contract signing, deposit Checkout) support: latest 2 major versions of Chrome, Safari, Firefox, and Edge on desktop; iOS Safari 15+ and Android Chrome 90+ on mobile.
- **NFR36:** Embedded Contact Form JavaScript uses no features unsupported by browsers in the support matrix above (no top-level await, no module workers, no native CSS-nesting reliance).

### Internationalization Readiness

- **NFR37:** All user-facing strings (UI labels, transactional email content, error messages, public surfaces) are centralized in a single string registry — no inline hardcoded strings in components or templates. Cheap at MVP time, retrofittable to i18n in Vision phase.

### Accessibility

Strict for system chrome (buttons, modals, payment surfaces, signature canvas, navigation, form elements). Recommended-but-not-enforced for owner-customizable content blocks (where photographer brand aesthetic may legitimately use lower-contrast styling at their own brand-liability risk).

- **NFR38:** System chrome on public client surfaces meets WCAG 2.1 AA: keyboard-only navigation, ≥4.5:1 color contrast for chrome text, semantic HTML, visible focus indicators, descriptive alt text on system imagery.
- **NFR39:** All form inputs have associated `<label>` elements; error messages are announced to screen readers via `aria-live`; checkboxes on the public Proposal viewer have explicit accessible names.
- **NFR40:** All public surfaces render correctly at 375px viewport width.
- **NFR41:** Touch targets on mobile public surfaces (Proposal package selection checkboxes, Accept/Sign buttons) are ≥44pt × 44pt.
- **NFR42:** The rule-firing log on the contract approval screen ("Music Licensing clause is included because the client selected Engagement Video") is screen-reader accessible — readable as semantic text, not solely visual.
- **NFR43:** Post-signing, focus shifts to an `aria-live="polite"` status region announcing "Signing complete. Opening payment page now." before navigating to Stripe Checkout, so screen-reader users aren't disoriented by the page transition.
- **NFR44:** Owner-customizable content blocks (proposal copy, contract clauses, package descriptions) are not enforced for WCAG compliance; owners are responsible for their brand-aesthetic accessibility decisions. The system surfaces a passive contrast-warning indicator in the editor when text falls below AA but does not block save.
