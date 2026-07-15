// ============================================================
// ManagingBrokersSection — owner-facing panel inside a brokerage's detail sheet.
//
// A brokerage can have several managing-broker logins, all sharing the same
// broker view. This lists them, lets the owner invite another (name + email),
// resend a password, remove one, and mark exactly one as the "principal" (the
// brokerage admin). All calls go through the owner-only /api/broker-logins.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Star, Trash2, KeyRound, UserPlus, Loader2, ShieldCheck } from "lucide-react";
import { getAuthToken } from "@/lib/supabase";
import { showInviteCredentials } from "@/lib/inviteCredentials";
import { useConfirm } from "@/components/ConfirmProvider";
import { toast } from "sonner";

interface Login {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  isPrincipal: boolean;
}

export default function ManagingBrokersSection({ brokerId, brokerCompany }: { brokerId: string; brokerCompany: string }) {
  const confirm = useConfirm();
  const [logins, setLogins] = useState<Login[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const call = useCallback(async (body: Record<string, unknown>) => {
    const token = await getAuthToken();
    const res = await fetch("/api/broker-logins", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ brokerId, ...body }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Something went wrong");
    return d;
  }, [brokerId]);

  const refresh = useCallback(async () => {
    try {
      const d = await call({ action: "list" });
      setLogins(d.logins || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load managing brokers");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  const add = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error("Enter a valid email"); return; }
    setAdding(true);
    try {
      const d = await call({ action: "add", name: name.trim(), email: email.trim() });
      showInviteCredentials("Managing broker invited", d.tempPassword, d.emailed !== false);
      setName(""); setEmail("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the managing broker");
    } finally {
      setAdding(false);
    }
  };

  const resend = async (l: Login) => {
    setBusyId(l.id);
    try {
      const d = await call({ action: "resend", userId: l.id });
      showInviteCredentials("New password ready", d.tempPassword, d.emailed !== false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reset the password");
    } finally {
      setBusyId("");
    }
  };

  const remove = async (l: Login) => {
    if (!(await confirm({ title: "Remove this managing broker?", description: `${l.name || l.email} will lose access to ${brokerCompany}. This can't be undone.`, destructive: true, confirmLabel: "Remove" }))) return;
    setBusyId(l.id);
    try {
      await call({ action: "remove", userId: l.id });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the managing broker");
    } finally {
      setBusyId("");
    }
  };

  const makePrincipal = async (l: Login) => {
    setBusyId(l.id);
    try {
      await call({ action: "set-principal", userId: l.isPrincipal ? null : l.id });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't set the principal");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
        <ShieldCheck className="w-3 h-3" /> Managing brokers
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2 py-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-1.5">
          {logins.length === 0 && (
            <p className="text-sm text-muted-foreground">No logins yet — add the first managing broker below.</p>
          )}
          {logins.map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm min-w-0">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                  {l.name || l.email}
                  {l.isPrincipal && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-300">
                      <Star className="w-3 h-3 fill-current" /> Principal
                    </span>
                  )}
                </div>
                {l.name && <div className="text-xs text-muted-foreground truncate">{l.email}</div>}
                {l.mustChangePassword && <div className="text-[11px] text-muted-foreground">Hasn't set their own password yet</div>}
              </div>
              <button
                onClick={() => makePrincipal(l)}
                disabled={busyId === l.id}
                title={l.isPrincipal ? "Unset principal" : "Make principal"}
                className={`shrink-0 p-1.5 rounded-md hover:bg-muted disabled:opacity-50 ${l.isPrincipal ? "text-amber-500" : "text-muted-foreground"}`}
              >
                <Star className={`w-3.5 h-3.5 ${l.isPrincipal ? "fill-current" : ""}`} />
              </button>
              <button onClick={() => resend(l)} disabled={busyId === l.id} title="Resend password" className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                <KeyRound className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => remove(l)} disabled={busyId === l.id} title="Remove" className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {/* Add another managing broker */}
          <div className="rounded-md border border-dashed border-border p-2.5 space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="h-8 text-sm" />
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="Email" className="h-8 text-sm" />
            </div>
            <Button onClick={add} disabled={adding || !email.trim()} size="sm" className="h-8 gap-1.5 w-full sm:w-auto">
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Add managing broker
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Each managing broker gets their own login into {brokerCompany} — same view, same agents. The principal is the one who'll manage staff going forward.</p>
        </div>
      )}
    </div>
  );
}
