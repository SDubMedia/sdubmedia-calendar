// ============================================================
// AddContactModal — Inline new-client modal triggered from the
// contract wizard's client step. Pre-fills name/email from the
// query the user typed and returns the created Client on save.
// ============================================================

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/contexts/AppContext";
import type { Client } from "@/lib/types";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (client: Client) => void;
  /** Pre-fill from whatever the user typed in the picker — could be a name or an email. */
  prefill?: string;
}

function looksLikeEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export default function AddContactModal({ open, onClose, onCreated, prefill }: Props) {
  const { addClient } = useApp();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressOpen, setAddressOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateAbbr, setStateAbbr] = useState("");
  const [zip, setZip] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset on open transition. Pre-fill email or first-name from query.
  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setAddressOpen(false);
    setAddress(""); setCity(""); setStateAbbr(""); setZip("");
    if (prefill && looksLikeEmail(prefill)) {
      setEmail(prefill.trim());
      setFirstName(""); setLastName(""); setCompany("");
    } else if (prefill) {
      const parts = prefill.trim().split(/\s+/);
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" "));
      setEmail("");
      setCompany("");
    } else {
      setFirstName(""); setLastName(""); setEmail(""); setCompany("");
    }
    setPhone("");
  }, [open, prefill]);

  const handleCreate = async () => {
    if (!firstName.trim()) { toast.error("First name required"); return; }
    if (!email.trim() || !looksLikeEmail(email)) { toast.error("Valid email required"); return; }
    setSaving(true);
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
      const client = await addClient({
        company: company.trim() || fullName,
        contactName: fullName,
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        state: stateAbbr.trim().toUpperCase(),
        zip: zip.trim(),
        billingModel: "per_project" as any,
        billingRatePerHour: 0,
        perProjectRate: 0,
        projectTypeRates: [],
        allowedProjectTypeIds: [],
        defaultProjectTypeId: "",
        roleBillingMultipliers: [],
      });
      onCreated(client);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to add contact");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add Contact</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">First name<span className="text-red-400">*</span></Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" className="bg-secondary border-border" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Last name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" className="bg-secondary border-border" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name (optional)" className="bg-secondary border-border" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email<span className="text-red-400">*</span></Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" className="bg-secondary border-border" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" className="bg-secondary border-border" />
          </div>

          <button
            type="button"
            onClick={() => setAddressOpen(o => !o)}
            className="text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1"
          >
            Additional info <ChevronDown className={`w-3 h-3 transition-transform ${addressOpen ? "rotate-180" : ""}`} />
          </button>
          {addressOpen && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" className="bg-secondary border-border" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">City</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">State</Label>
                  <Input value={stateAbbr} onChange={(e) => setStateAbbr(e.target.value)} maxLength={2} className="bg-secondary border-border" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Zip</Label>
                <Input value={zip} onChange={(e) => setZip(e.target.value)} className="bg-secondary border-border max-w-[140px]" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>{saving ? "Adding…" : "Add Contact"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
