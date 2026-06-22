// ============================================================
// One-time disclosures shown before an agent or broker can book / be billed.
//
// DRAFT TERMS — written in plain English as a starting point. Have counsel
// review and adjust before relying on these. Bump AGREEMENT_VERSION whenever the
// wording materially changes; anyone whose stored version differs is re-prompted.
//
// Placeholders in [brackets] are business choices to confirm with your lawyer
// (cancellation window, payment terms, governing state, license scope).
// ============================================================

import type { ReactNode } from "react";

export const AGREEMENT_VERSION = "2026-06-21";

const COMPANY = "SDub Media LLC";

/** True once this client has accepted the CURRENT version of the terms. */
export function hasAcceptedAgreement(client?: { agreementVersion?: string | null } | null): boolean {
  return !!client && client.agreementVersion === AGREEMENT_VERSION;
}

export interface AgreementContent {
  title: string;
  /** Short line under the title. */
  intro: string;
  body: ReactNode;
  /** Checkbox label the user must tick to accept. */
  consentLabel: string;
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold text-foreground">{heading}</h4>
      <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">{children}</div>
    </div>
  );
}

/** The agreement shown to AGENTS — covers both agents who pay for themselves and
 *  agents whose brokerage covers them. Includes the card-on-file authorization. */
function agentContent(): AgreementContent {
  return {
    title: "Booking & Payment Agreement",
    intro: "Please review before booking your first shoot.",
    consentLabel:
      "I have read and agree to these terms, and I authorize the card on file to be charged as described.",
    body: (
      <div className="space-y-3">
        <Section heading="How booking works">
          <p>
            You request a shoot for one of your listings — property address, the
            pieces you need, and a preferred time. We confirm and schedule it,
            capture the media, and deliver your photos/video to you when they're
            ready.
          </p>
        </Section>
        <Section heading="Pricing">
          <p>
            You'll see the price of each piece before you submit a request. The
            total for your shoot is the sum of the pieces you select at the rates
            shown at the time of booking.
          </p>
        </Section>
        <Section heading="Who pays">
          <p>
            If your brokerage has agreed to cover your shoots, {COMPANY} bills the
            brokerage. <strong>If your brokerage does not pay for a shoot you
            requested, you are responsible for it</strong>, and you authorize us
            to charge your card on file for that shoot.
          </p>
        </Section>
        <Section heading="Card on file & authorization">
          <p>
            We securely store your payment card with our payment processor
            (Stripe); {COMPANY} does not store your full card number. By saving
            your card you authorize {COMPANY} to charge it for shoots you request
            that are not otherwise paid — including completed shoots and
            late-cancellation or no-show fees described below — without
            re-entering your card each time.
          </p>
        </Section>
        <Section heading="Cancellation & rescheduling">
          <p>
            You can reschedule or cancel a shoot up to [24 hours] before the
            scheduled time at no charge. Cancellations inside [24 hours], no-shows,
            or no-access at the property may incur a fee of up to [the full shoot
            price]. {/* lawyer: confirm window + fee */}
          </p>
        </Section>
        <Section heading="Your media">
          <p>
            Photos and video are delivered for marketing the listed property. You
            receive a license to use the delivered media for real-estate marketing;
            {COMPANY} retains ownership of the original files and the right to use
            them in its own portfolio unless otherwise agreed. [Confirm license
            scope with counsel.]
          </p>
        </Section>
        <Section heading="Contact">
          <p>Questions about a charge or a shoot? Email support@sdubmedia.com.</p>
        </Section>
      </div>
    ),
  };
}

/** The agreement shown to BROKERS — they're invoiced monthly for their agents'
 *  shoots. No card required. */
function brokerContent(): AgreementContent {
  return {
    title: "Brokerage Billing Agreement",
    intro: "Please review before your agents book through Slate.",
    consentLabel:
      "I have read and agree to these terms on behalf of my brokerage.",
    body: (
      <div className="space-y-3">
        <Section heading="What you're agreeing to">
          <p>
            Agents you invite can request photo/video shoots for their listings
            that bill to your brokerage. You're agreeing to pay {COMPANY} for the
            shoots your agents book under your account.
          </p>
        </Section>
        <Section heading="Billing & payment terms">
          <p>
            {COMPANY} invoices your brokerage [monthly] for all shoots your agents
            booked in that period, itemized by agent, property, and the pieces
            delivered. Invoices are due within [Net 15] days of the invoice date.
            {/* lawyer: confirm cycle + net terms */}
          </p>
        </Section>
        <Section heading="Unpaid balances">
          <p>
            If an invoice isn't paid by its due date, {COMPANY} may pause new
            bookings for your agents and [apply a late fee of __ / charge the
            requesting agent's card on file] until the balance is settled.
            [Confirm remedy with counsel.]
          </p>
        </Section>
        <Section heading="Managing your agents">
          <p>
            You can invite and see your agents and their shoots from your account.
            You're responsible for the bookings made by agents you've invited.
          </p>
        </Section>
        <Section heading="Contact">
          <p>Questions about an invoice? Email support@sdubmedia.com.</p>
        </Section>
      </div>
    ),
  };
}

export function agreementContent(kind: "agent" | "broker"): AgreementContent {
  return kind === "broker" ? brokerContent() : agentContent();
}
