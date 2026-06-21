// ============================================================
// InviteBrokerDialog — owner invites a brokerage in one step: creates the broker
// client record, a client-role login tied to it, and emails the welcome. Reuses
// addClient + createUser + /api/invite-user (all owner-permitted).
// ============================================================

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthToken } from "@/lib/supabase";
import { formatPhoneInput } from "@/lib/utils";
import { toast } from "sonner";

function genPassword(): string {
  return "Br" + Math.random().toString(36).slice(2, 10) + "7a";
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function InviteBrokerDialog({ open, onClose }: Props) {
  const { addClient } = useApp();
  const { createUser } = useAuth();
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setCompany(""); setContactName(""); setEmail(""); setPhone(""); };

  const handleInvite = async () => {
    if (!company.trim()) { toast.error("Enter the brokerage name"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error("Enter a valid email"); return; }
    setSaving(true);
    try {
      // 1) Broker client record
      const broker = await addClient({
        company: company.trim(),
        contactName: (contactName.trim() || company.trim()),
        email: email.trim(),
        phone,
        address: "", city: "", state: "", zip: "",
        billingModel: "per_project",
        billingRatePerHour: 0,
        perProjectRate: 0,
        projectTypeRates: [],
        allowedProjectTypeIds: [],
        defaultProjectTypeId: "",
        roleBillingMultipliers: [],
        clientType: "broker",
        brokerId: null,
      });
      // 2) Login tied to that broker
      const tempPassword = genPassword();
      const userId = await createUser(email.trim(), tempPassword, (contactName.trim() || company.trim()), "client", [broker.id]);
      // 3) Welcome email
      const token = await getAuthToken();
      const res = await fetch("/api/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ userId, tempPassword }),
      });
      if (!res.ok) {
        toast.success(`Broker created. Email didn't send — temp password: ${tempPassword}`);
      } else {
        toast.success("Broker invited — they'll get an email to log in");
      }
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't invite the broker");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Invite a brokerage</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Brokerage name</Label>
            <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Realty ONE" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Contact name (optional)</Label>
            <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Pat Broker" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="office@realtyone.com" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Phone (optional)</Label>
            <Input inputMode="tel" value={phone} onChange={e => setPhone(formatPhoneInput(e.target.value))} placeholder="615-555-0100" className="mt-1" />
          </div>
          <p className="text-xs text-muted-foreground">They get a login to see their agents, what they owe this month and year, and (once you send an invoice) pay it. They never see your costs.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground">Cancel</Button>
          <Button onClick={handleInvite} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Inviting…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
