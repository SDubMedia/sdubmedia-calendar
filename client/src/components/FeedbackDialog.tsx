import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getAuthToken } from "@/lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = ["Bug Report", "Feature Request", "Question", "General"];

export default function FeedbackDialog({ open, onClose }: Props) {
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("General");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) { toast.error("Please enter a message"); return; }
    setSending(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: message.trim(), category }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success("Feedback sent — thanks!");
      setMessage("");
      setCategory("General");
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Send Feedback</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Message *</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the bug, feature idea, or question..."
              rows={5}
              className="bg-secondary border-border resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={sending}>
            {sending ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
