// ============================================================
// InviteAgentDialog — a brokerage invites one of their agents. Posts to the
// scoped server endpoint, which creates the agent (under this broker) + login.
// ============================================================

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthToken } from "@/lib/supabase";
import { formatPhoneInput } from "@/lib/utils";
import { toast } from "sonner";
import { showInviteCredentials } from "@/lib/inviteCredentials";

interface Props {
  open: boolean;
  onClose: () => void;
  onInvited?: () => void;
}

export default function InviteAgentDialog({ open, onClose, onInvited }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(""); setEmail(""); setPhone(""); };

  const handleInvite = async () => {
    if (!name.trim()) { toast.error("Enter the agent's name"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error("Enter a valid email"); return; }
    setSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/broker-invite-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone }),
      });
      const data = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) throw new Error(data.error || "Couldn't invite the agent");
      if (data.tempPassword) showInviteCredentials("Agent invited", data.tempPassword, data.emailed !== false);
      else toast.success("Agent invited — they'll get an email to log in");
      reset();
      onInvited?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't invite the agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Invite an agent</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Agent name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@brokerage.com" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Phone (optional)</Label>
            <Input inputMode="tel" value={phone} onChange={e => setPhone(formatPhoneInput(e.target.value))} placeholder="615-555-0100" className="mt-1" />
          </div>
          <p className="text-xs text-muted-foreground">They'll get a login to view their listings and request shoots. Your brokerage is billed — they never see pricing or costs.</p>
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
