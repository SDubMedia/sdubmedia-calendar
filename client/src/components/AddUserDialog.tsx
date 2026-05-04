// ============================================================
// AddUserDialog — Owner-only quick-add user modal.
// Mirrors the create-user form on UsersPage but pared down for
// fast inline use (e.g. from the calendar header). Reuses the
// AuthContext.createUser + /api/invite-user endpoints — no new
// auth code.
// ============================================================

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { getAuthToken } from "@/lib/supabase";
import type { UserRole } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Optional: when set, defaults the new user's attached client + role.
  defaultClientId?: string;
}

function generateTempPassword(): string {
  // Browser CSPRNG. base36 of 6 random bytes → ~9 chars, mixed case-insensitive.
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(36).padStart(2, "0")).join("");
}

export default function AddUserDialog({ open, onOpenChange, defaultClientId }: Props) {
  const { createUser } = useAuth();
  const { data } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("client");
  const [clientIds, setClientIds] = useState<string[]>(defaultClientId ? [defaultClientId] : []);
  const [crewMemberId, setCrewMemberId] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setRole("client");
    setClientIds(defaultClientId ? [defaultClientId] : []);
    setCrewMemberId("");
    setSendInvite(true);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const toggleClient = (id: string) => {
    setClientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreate = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email");
      return;
    }
    if ((role === "client" || role === "partner") && clientIds.length === 0) {
      toast.error("Attach at least one client");
      return;
    }
    if (role === "staff" && !crewMemberId) {
      toast.error("Select a crew member for staff users");
      return;
    }

    const tempPassword = generateTempPassword();
    setSubmitting(true);
    try {
      const newUserId = await createUser(email, tempPassword, name, role, clientIds, crewMemberId);
      toast.success(`User "${name}" created`);

      if (sendInvite) {
        try {
          const token = await getAuthToken();
          const res = await fetch("/api/invite-user", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ userId: newUserId, tempPassword }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Failed" }));
            throw new Error(err.error || "Failed to send invite");
          }
          toast.success(`Welcome email sent to ${email}`);
        } catch (inviteErr) {
          const msg = inviteErr instanceof Error ? inviteErr.message : "invite failed";
          toast.error(`User created but invite failed: ${msg}`);
        }
      }

      handleClose(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="bg-card border-border text-foreground max-w-lg max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Add User</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            A temporary password will be generated and emailed automatically. They&apos;ll be asked to change it on first login.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 my-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Full name"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="client">Client — view their own projects</option>
              <option value="partner">Partner — financial view for attached clients</option>
              <option value="staff">Staff — view own schedule & pay</option>
              <option value="family">Family — personal calendar only</option>
              <option value="owner">Owner — full access</option>
            </select>
          </div>

          {(role === "staff" || role === "owner" || role === "partner") && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                {role === "staff" ? "Assign to Crew Member" : "Link to Crew Profile (optional)"}
              </label>
              <select
                value={crewMemberId}
                onChange={e => setCrewMemberId(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{role === "staff" ? "Select crew member..." : "None"}</option>
                {data.crewMembers.map(cm => (
                  <option key={cm.id} value={cm.id}>{cm.name}</option>
                ))}
              </select>
            </div>
          )}

          {(role === "client" || role === "partner") && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">Attach to Client(s)</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {data.clients.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No clients yet — create one on the Clients page first.</p>
                ) : data.clients.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleClient(c.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs border transition-colors",
                      clientIds.includes(c.id)
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    {c.company || c.contactName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pt-2 border-t border-border">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={e => setSendInvite(e.target.checked)}
              className="rounded border-border"
            />
            Send welcome email with temporary password
          </label>
        </div>

        <AlertDialogFooter className="gap-2 flex-col sm:flex-row">
          <AlertDialogCancel className="border-border" disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCreate}
            disabled={submitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting ? "Creating…" : "Create & Send Invite"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
