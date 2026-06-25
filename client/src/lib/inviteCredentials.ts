import { toast } from "sonner";

// Show a freshly-created login's temp password to whoever sent the invite, so
// they can hand it over directly — onboarding never hinges on the email landing
// (which silently bounces or spam-filters often enough to matter). Persistent +
// copyable on purpose: a password shouldn't auto-dismiss before it's used.
export function showInviteCredentials(title: string, tempPassword: string, emailed: boolean) {
  toast.success(title, {
    description: `Temp password: ${tempPassword}${emailed ? " — emailed to them too" : " — email didn't send, so share this so they can log in"}`,
    duration: Infinity,
    closeButton: true,
    action: {
      label: "Copy",
      onClick: () => { try { void navigator.clipboard?.writeText(tempPassword); } catch { /* clipboard unavailable */ } },
    },
  });
}
