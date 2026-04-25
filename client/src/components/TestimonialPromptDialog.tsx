// ============================================================
// TestimonialPromptDialog — Asks the owner for a short testimonial
// after a meaningful moment (first paid invoice). Stores as pending;
// a human approves before it appears on getslate.net.
// ============================================================

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getAuthToken } from "@/lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
  trigger?: string;
  defaultName?: string;
  defaultCompany?: string;
}

export default function TestimonialPromptDialog({ open, onClose, trigger, defaultName, defaultCompany }: Props) {
  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState(defaultName || "");
  const [authorCompany, setAuthorCompany] = useState(defaultCompany || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!content.trim()) {
      toast.error("Please write a short testimonial first");
      return;
    }
    setSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/submit-testimonial", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content, authorName, authorCompany, trigger }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to submit");
      }
      toast.success("Thanks — we'll review and share it on getslate.net.");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            🎉 You just got paid through Slate
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Mind sharing a quick line or two about your experience? It helps other production company owners decide if Slate's for them. Nothing goes live until we check in with you.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Your testimonial</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Slate has..."
              rows={4}
              className="bg-secondary border-border text-sm"
              maxLength={1200}
            />
            <div className="text-[10px] text-muted-foreground text-right">{content.length}/1200</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Your name (optional)</Label>
              <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="bg-secondary border-border text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Company (optional)</Label>
              <Input value={authorCompany} onChange={(e) => setAuthorCompany(e.target.value)} className="bg-secondary border-border text-sm" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Not now</Button>
          <Button onClick={handleSubmit} disabled={saving || !content.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Sending…" : "Share"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
