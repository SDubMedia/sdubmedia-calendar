// ============================================================
// Shared email-letterhead helpers.
//
// Returns a header HTML string + footer HTML string customized with the
// org's name + business info (address / phone / email). Used across every
// client-facing transactional email so the brand experience is consistent.
//
// Why no logo: logos are stored as data: URLs in Slate. Most email clients
// (Gmail, Outlook) strip data: URLs from `<img>` tags or block them by
// default, so embedding the logo in email would render as a broken image
// for the majority of recipients. When we later host logos at a public
// URL (R2 / Vercel blob), this helper can swap in an `<img>` cleanly.
// ============================================================

import { escapeHtml } from "./_auth.js";

export interface EmailBrandingInput {
  orgName?: string | null;
  businessInfo?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    email?: string;
    website?: string;
  } | null;
}

/**
 * Top header for branded emails. Currently just a serif company name +
 * thin divider. Future: when logo URLs are public-hostable, replace with
 * an `<img>` of the logo.
 */
export function emailHeader(input: EmailBrandingInput): string {
  const name = input.orgName?.trim() || "";
  if (!name) return "";
  return `<div style="text-align:center;padding:20px 0 16px;border-bottom:1px solid #e5e7eb;margin-bottom:24px;">
    <p style="margin:0;font-family:'Georgia',serif;font-size:22px;font-weight:600;color:#1e293b;letter-spacing:0.02em;">${escapeHtml(name)}</p>
  </div>`;
}

/**
 * Bottom footer with the org's address + phone + email. Renders nothing
 * when no business info is configured. Always above any "Powered by Slate"
 * tagline so the contractor's brand is the dominant signal.
 */
export function emailFooter(input: EmailBrandingInput): string {
  const name = input.orgName?.trim() || "";
  const bi = input.businessInfo || {};
  const address = [bi.address, bi.city, bi.state, bi.zip].filter(Boolean).join(", ");
  const phone = bi.phone?.trim() || "";
  const email = bi.email?.trim() || "";
  const website = bi.website?.trim() || "";

  // Skip entire footer if there's nothing to show.
  if (!name && !address && !phone && !email && !website) return "";

  return `<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;color:#94a3b8;font-size:12px;line-height:1.6;">
    ${name ? `<p style="margin:0 0 4px;color:#475569;font-weight:600;">${escapeHtml(name)}</p>` : ""}
    ${address ? `<p style="margin:2px 0;">${escapeHtml(address)}</p>` : ""}
    <p style="margin:2px 0;">
      ${phone ? `<span>${escapeHtml(phone)}</span>` : ""}
      ${phone && email ? `<span style="margin:0 6px;">·</span>` : ""}
      ${email ? `<span>${escapeHtml(email)}</span>` : ""}
    </p>
    ${website ? `<p style="margin:2px 0;"><a href="${escapeHtml(website.startsWith("http") ? website : `https://${website}`)}" style="color:#94a3b8;text-decoration:none;">${escapeHtml(website)}</a></p>` : ""}
  </div>`;
}

/**
 * Convenience: wrap an HTML body fragment with branded header + footer.
 */
export function brandedEmailWrapper(input: EmailBrandingInput, bodyHtml: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b;">
    ${emailHeader(input)}
    ${bodyHtml}
    ${emailFooter(input)}
  </div>`;
}
