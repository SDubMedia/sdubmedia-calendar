// ============================================================
// PhotographyClientSetup — required first-run setup for a photography client.
// They can't use the portal until they confirm their address, phone, and save
// a card on file for default billing. The card is NOT charged here — it's only
// charged when the owner sends an invoice. Owner preview (impersonation)
// bypasses this gate, so you're never locked out of previewing their portal.
// ============================================================

import { useEffect, useState } from "react";
import { Film, MapPin, Phone, CreditCard, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthToken } from "@/lib/supabase";
import { formatPhoneInput } from "@/lib/utils";
import { toast } from "sonner";
import type { Client } from "@/lib/types";

export default function PhotographyClientSetup({ client }: { client: Client }) {
  const { refresh } = useApp();
  const { signOut } = useAuth();

  const hasContact = !!client.address?.trim() && !!client.phone?.trim();
  const hasCard = !!client.cardOnFile;

  const [address, setAddress] = useState(client.address ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [savingContact, setSavingContact] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Returning from Stripe card setup — confirm the card directly (don't wait on
  // the webhook), then refresh so the gate clears.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("card") !== "1") return;
    setConfirming(true);
    (async () => {
      try {
        const token = await getAuthToken();
        await fetch("/api/confirm-card", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      } catch { /* webhook will still stamp it */ }
      await refresh();
      window.history.replaceState({}, "", window.location.pathname);
      setConfirming(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveContact = async () => {
    if (!address.trim() || !phone.trim()) { toast.error("Add your address and phone number"); return; }
    setSavingContact(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/client-save-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address, phone }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) throw new Error(body.error || "Couldn't save");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your info");
    } finally {
      setSavingContact(false);
    }
  };

  const addCard = async () => {
    setAddingCard(true);
    try {
      const token = await getAuthToken();
      const here = window.location.origin + window.location.pathname;
      const res = await fetch("/api/stripe-save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ successUrl: `${here}?card=1`, cancelUrl: here }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) throw new Error(body.error || "Couldn't start card setup");
      window.location.assign(body.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start card setup");
      setAddingCard(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-3">
            <Film className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Let's finish setting up your account
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            A couple quick things before you get started — this only happens once.
          </p>
        </div>

        {/* Step 1 — contact info */}
        <div className="bg-card border border-border rounded-xl p-4 mb-3">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${hasContact ? "bg-green-500/20 text-green-400" : "bg-primary/15 text-primary"}`}>
              {hasContact ? <Check className="w-3.5 h-3.5" /> : "1"}
            </div>
            <span className="text-sm font-medium text-foreground">Your contact info</span>
          </div>
          {hasContact ? (
            <p className="text-xs text-muted-foreground pl-8">{client.address} · {client.phone}</p>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Mailing address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Nashville, TN 37011" className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> Phone number</Label>
                <Input value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} inputMode="tel" placeholder="615-000-0000" className="bg-secondary border-border mt-1" />
              </div>
              <Button onClick={saveContact} disabled={savingContact} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                {savingContact ? "Saving…" : "Save & continue"}
              </Button>
            </div>
          )}
        </div>

        {/* Step 2 — card on file */}
        <div className={`bg-card border border-border rounded-xl p-4 ${!hasContact ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${hasCard ? "bg-green-500/20 text-green-400" : "bg-primary/15 text-primary"}`}>
              {hasCard ? <Check className="w-3.5 h-3.5" /> : "2"}
            </div>
            <span className="text-sm font-medium text-foreground">Card on file for billing</span>
          </div>
          {hasCard ? (
            <p className="text-xs text-muted-foreground pl-8">Card saved{client.cardBrand ? ` — ${client.cardBrand} ····${client.cardLast4 ?? ""}` : ""}.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-secondary/40 border border-border p-3">
                <ShieldCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Your card is saved securely and <span className="text-foreground font-medium">won't be charged until you receive an invoice</span>. It just lets us bill you for work you approve.
                </p>
              </div>
              <Button onClick={addCard} disabled={addingCard || confirming} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <CreditCard className="w-4 h-4" /> {confirming ? "Confirming…" : addingCard ? "Opening…" : "Add card on file"}
              </Button>
            </div>
          )}
        </div>

        <button onClick={signOut} className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-4">Sign out</button>
      </div>
    </div>
  );
}
