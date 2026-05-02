// ============================================================
// projectMailto — build a `mailto:` URL with a pre-filled subject and
// body for emailing a client about their project (confirmation /
// cancellation / reschedule).
//
// Used in place of server-side Resend for these messages so the email
// goes from the user's own account (no domain verification required).
// Works on every device + email client; great UX for app store SaaS
// users who can't / won't configure DNS records.
// ============================================================

export interface ProjectMailtoInput {
  to: string;
  orgName: string;
  ownerName: string;
  clientName: string;
  projectType: string;
  date: string;          // ISO YYYY-MM-DD
  startTime: string;     // HH:MM
  endTime: string;       // HH:MM
  location: string;
  cancelled: boolean;
  cancellationReason?: string;
  // Reschedule mode — when set, we render the "moved from previousDate"
  // copy and use the rescheduled subject.
  rescheduledFromDate?: string; // ISO YYYY-MM-DD of the original date
}

export function buildProjectMailto(input: ProjectMailtoInput): string {
  const subject = input.cancelled
    ? `Cancellation: ${input.projectType} on ${formatDate(input.date)}`
    : input.rescheduledFromDate
      ? `Rescheduled: ${input.projectType} now on ${formatDate(input.date)}`
      : `Confirmed: ${input.projectType} on ${formatDate(input.date)}`;

  const lines: string[] = [];
  lines.push(`Hi ${input.clientName.split(/\s+/)[0] || "there"},`);
  lines.push("");

  if (input.cancelled) {
    lines.push(
      `I'm writing to confirm the cancellation of your ${input.projectType.toLowerCase()} originally scheduled for ${formatDate(input.date)}${input.location ? ` at ${input.location}` : ""}.`,
    );
    if (input.cancellationReason) {
      lines.push("");
      lines.push("Reason:");
      lines.push(input.cancellationReason);
    }
    lines.push("");
    lines.push("Let me know if you'd like to reschedule.");
  } else if (input.rescheduledFromDate) {
    lines.push(
      `Just a heads-up — we've moved your ${input.projectType.toLowerCase()} from ${formatDate(input.rescheduledFromDate)} to ${formatDate(input.date)}.`,
    );
    lines.push("");
    lines.push("Updated details:");
    lines.push(`📅 ${formatDate(input.date)}`);
    if (input.startTime || input.endTime) {
      lines.push(`🕐 ${input.startTime}${input.endTime ? ` – ${input.endTime}` : ""}`);
    }
    if (input.location) {
      lines.push(`📍 ${input.location}`);
    }
    lines.push("");
    lines.push("If this new date doesn't work for you, reply and we'll find another.");
  } else {
    lines.push(`Confirming your ${input.projectType.toLowerCase()}:`);
    lines.push("");
    lines.push(`📅 ${formatDate(input.date)}`);
    if (input.startTime || input.endTime) {
      lines.push(`🕐 ${input.startTime}${input.endTime ? ` – ${input.endTime}` : ""}`);
    }
    if (input.location) {
      lines.push(`📍 ${input.location}`);
    }
    lines.push("");
    lines.push("Reply to this email if you have any questions or need to make changes.");
  }

  lines.push("");
  lines.push(`Thanks,`);
  lines.push(input.ownerName || input.orgName);
  if (input.ownerName && input.orgName && input.ownerName !== input.orgName) {
    lines.push(input.orgName);
  }

  const body = lines.join("\n");
  return `mailto:${encodeURIComponent(input.to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function formatDate(iso: string): string {
  if (!iso) return "TBD";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
