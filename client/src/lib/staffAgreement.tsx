// ============================================================
// The 1099 independent-contractor agreement staff sign during onboarding.
// Bump STAFF_AGREEMENT_VERSION whenever the wording materially changes — a new
// version means a fresh staff_agreements row / re-sign.
//
// NOTE: this is a business document, not legal advice — have a Tennessee
// attorney review before relying on it.
// ============================================================

export const STAFF_AGREEMENT_VERSION = "2026-07-11";
export const STAFF_AGREEMENT_TITLE = "Master Independent Contractor Agreement";

// The built-in agreement as one plain-text document, with the org's company
// name substituted. This is what a new org's editable agreement is seeded from,
// and what's shown/signed when the org hasn't customized it. Kept in sync with
// the structured sections below so there's a single source of truth.
export function defaultAgreementText(company: string): string {
  const c = (company || "").trim() || "SDub Media, LLC";
  const lines: string[] = [STAFF_AGREEMENT_TITLE, "", STAFF_AGREEMENT_INTRO, ""];
  for (const s of STAFF_AGREEMENT_SECTIONS) {
    lines.push(s.heading);
    for (const b of s.blocks) {
      if (b.bullets) for (const li of b.bullets) lines.push(`  • ${li}`);
      else if (b.text) lines.push(b.text);
    }
    lines.push("");
  }
  return lines.join("\n").replace(/SDub Media, LLC/g, c).replace(/SDub Media/g, c).trim();
}

export interface AgreementBlock {
  text?: string;
  bullets?: string[];
}
export interface AgreementSection {
  heading: string;
  blocks: AgreementBlock[];
}

export const STAFF_AGREEMENT_INTRO =
  "This Master Independent Contractor Agreement (\"Agreement\") is made as of the date of the electronic signature below, by and between SDub Media, LLC, a Tennessee limited liability company (\"Company\"), and the individual accepting this Agreement (\"Contractor\"). The Company and Contractor may each be referred to as a \"Party\" and together as the \"Parties.\" Please read it in full before signing.";

export const STAFF_AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    heading: "1. Independent Contractor Relationship",
    blocks: [
      { text: "Contractor is an independent contractor and is not an employee, partner, joint venturer, or agent of the Company. Nothing in this Agreement creates an employer-employee relationship, and Contractor has no authority to bind the Company or act on its behalf." },
      { text: "Contractor is solely responsible for:" },
      { bullets: ["Federal, state, and local taxes", "Self-employment taxes", "Business licenses and permits", "Insurance", "Equipment", "Transportation", "All other business expenses"] },
      { text: "The Company will report payments to Contractor on IRS Form 1099 as required and will not withhold taxes. Contractor will provide a completed IRS Form W-9 before payment. Contractor is not eligible for Company benefits, including retirement, health insurance, workers' compensation, unemployment insurance, paid leave, or overtime." },
    ],
  },
  {
    heading: "2. Services",
    blocks: [
      { text: "Contractor may perform services including but not limited to:" },
      { bullets: ["Real estate photography", "Commercial photography", "Wedding photography", "Portrait photography", "Videography", "Drone photography/videography (when authorized)", "Editing", "Floor plans", "Twilight photography", "Aerial imaging", "Media delivery", "Other creative services assigned by the Company"] },
      { text: "The Company is under no obligation to provide work, and Contractor is under no obligation to accept work." },
    ],
  },
  {
    heading: "3. Assignment Acceptance",
    blocks: [
      { text: "Each assignment is a separate engagement. By accepting an assignment, Contractor agrees to:" },
      { bullets: ["Complete the assignment personally unless otherwise approved", "Meet all deadlines", "Follow Company instructions", "Represent SDub Media professionally"] },
    ],
  },
  {
    heading: "4. Compensation",
    blocks: [
      { text: "Compensation for each assignment is at the rate recorded for Contractor in the Company's system (Slate) and/or communicated to Contractor in writing before the assignment is accepted. Unless stated otherwise, an assignment rate includes editing and delivery of the final files for that assignment." },
      { text: "The Company may modify rates prospectively by written notice; updated rates apply to assignments accepted after the notice. Accepting an assignment confirms Contractor's agreement to its rate." },
    ],
  },
  {
    heading: "5. Payment",
    blocks: [
      { text: "Payment will generally be issued after assignment completion, delivery of all requested files, and the Company's acceptance of the deliverables. Contractor understands that incomplete work may delay payment." },
    ],
  },
  {
    heading: "6. Equipment",
    blocks: [
      { text: "Contractor shall provide and maintain professional working equipment, including:" },
      { bullets: ["Camera bodies", "Lenses", "Memory cards", "Batteries", "Lighting", "Drone (if applicable)", "Computer", "Editing software", "Vehicle"] },
    ],
  },
  {
    heading: "7. Professional Standards",
    blocks: [
      { text: "Contractor agrees to:" },
      { bullets: ["Arrive on time", "Dress professionally", "Maintain professional behavior", "Communicate respectfully", "Protect the Company's reputation", "Follow all client instructions"] },
      { text: "Contractor shall never discuss pricing directly with clients unless authorized." },
    ],
  },
  {
    heading: "8. Confidential Information",
    blocks: [
      { text: "Contractor agrees to keep confidential all Company information, including:" },
      { bullets: ["Client lists", "Pricing", "Contracts", "Vendor relationships", "Marketing plans", "Editing workflows", "Internal procedures", "Financial information", "CRM information", "Company documents"] },
      { text: "This obligation survives termination of this Agreement." },
    ],
  },
  {
    heading: "9. Client Non-Solicitation",
    blocks: [
      { text: "During this Agreement and for two (2) years following termination, Contractor agrees not to knowingly solicit Company clients, accept work directly from Company clients that bypasses the Company, or encourage Company clients to stop doing business with SDub Media." },
      { text: "This restriction applies only to clients introduced through SDub Media or for whom Contractor performed services through SDub Media." },
    ],
  },
  {
    heading: "10. Non-Recruitment",
    blocks: [
      { text: "For two (2) years following termination, Contractor shall not knowingly recruit or induce SDub Media employees or contractors to leave the Company to compete directly with it." },
    ],
  },
  {
    heading: "11. Intellectual Property",
    blocks: [
      { text: "All deliverables and work product Contractor creates under this Agreement are, to the fullest extent permitted by law, works made for hire owned by the Company. Upon payment, Contractor irrevocably assigns to SDub Media, LLC all right, title, and interest — worldwide and for the full term of protection — in all work created for the Company, including:" },
      { bullets: ["RAW files", "JPEG images", "TIFF files", "PSD files", "Videos", "Drone footage", "Audio recordings", "Lightroom catalogs", "Project and source files", "Edited media and all deliverables"] },
      { text: "To the extent any such rights cannot be assigned, Contractor grants the Company a perpetual, worldwide, royalty-free, exclusive license to use them and waives any moral rights to the maximum extent permitted by law." },
    ],
  },
  {
    heading: "12. Portfolio Use",
    blocks: [
      { text: "Contractor shall not publish or display Company work — in social media, websites, advertising, portfolios, or print — without prior written permission from SDub Media." },
    ],
  },
  {
    heading: "13. File Delivery",
    blocks: [
      { text: "Contractor shall deliver RAW files, edited files (if applicable), and project files (if requested) using the Company's approved upload method. Files shall not be deleted until the Company confirms receipt." },
    ],
  },
  {
    heading: "14. Insurance",
    blocks: [
      { text: "Contractor is responsible for maintaining any insurance required by law or necessary for Contractor's business. If Contractor operates a drone, Contractor is responsible for complying with all FAA regulations and maintaining any required certifications." },
    ],
  },
  {
    heading: "15. Indemnification",
    blocks: [
      { text: "Each Party is responsible for its own negligent or wrongful acts. Contractor agrees to indemnify and hold harmless SDub Media from losses arising out of Contractor's negligence, misconduct, breach of this Agreement, or violation of applicable laws." },
    ],
  },
  {
    heading: "16. Independent Business",
    blocks: [
      { text: "Contractor remains free to perform services for other businesses, but agrees not to use confidential information or Company client relationships in competing against SDub Media." },
    ],
  },
  {
    heading: "17. Termination & Survival",
    blocks: [
      { text: "Either Party may terminate this Agreement at any time by written notice. Termination does not affect payment owed for completed assignments, and the following survive termination: confidentiality, intellectual property ownership, non-solicitation, non-recruitment, and indemnification." },
    ],
  },
  {
    heading: "18. Electronic Signature",
    blocks: [
      { text: "The Parties agree this Agreement may be signed electronically. Contractor's electronic signature has the same legal effect as a handwritten signature under the U.S. E-SIGN Act and the Tennessee Uniform Electronic Transactions Act, and constitutes Contractor's acceptance of the entire Agreement." },
    ],
  },
  {
    heading: "19. Assignment & Severability",
    blocks: [
      { text: "Contractor may not assign or subcontract this Agreement or any assignment without the Company's prior written consent; the Company may assign this Agreement to a successor or affiliate. If any provision is held unenforceable, the remaining provisions stay in full force and the unenforceable provision will be enforced to the maximum extent permitted by law." },
    ],
  },
  {
    heading: "20. Governing Law & Entire Agreement",
    blocks: [
      { text: "This Agreement is governed by the laws of the State of Tennessee and constitutes the entire agreement between the Parties. Any modification must be in writing and signed (including electronically) by both Parties." },
    ],
  },
];
