// ============================================================
// CalendarSyncPage — Subscribe to Slate calendar from any app
// Available to all roles
// ============================================================

import { useApp } from "@/contexts/AppContext";
import { CalendarDays, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function CalendarSyncPage() {
  const { data } = useApp();
  const orgId = data.organization?.id || "";

  const feedBase = `${window.location.origin}/api/calendar.ics`;
  const feedUrl = `${feedBase}?key=${orgId}&type=all`;
  const webcalUrl = feedUrl.replace("https://", "webcal://").replace("http://", "webcal://");
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;

  function copyUrl() {
    const input = document.createElement("textarea");
    input.value = feedUrl;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    toast.success("Feed URL copied!");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Calendar Sync
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Subscribe to your Slate calendar from Google, Apple, or any calendar app</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Google Calendar */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Google Calendar</h2>
                <p className="text-xs text-muted-foreground">Click the button below to add your Slate calendar to Google Calendar</p>
              </div>
            </div>
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Add to Google Calendar
            </a>
            <p className="text-[10px] text-muted-foreground text-center">Google Calendar syncs automatically every 12-24 hours</p>
          </div>

          {/* Apple Calendar */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-500/10 flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-zinc-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Apple Calendar</h2>
                <p className="text-xs text-muted-foreground">Click to subscribe in Apple Calendar (Mac, iPhone, iPad)</p>
              </div>
            </div>
            <a
              href={webcalUrl}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-secondary border border-border text-foreground rounded-lg text-sm font-semibold hover:bg-secondary/80 transition-colors"
            >
              <CalendarDays className="w-4 h-4" />
              Add to Apple Calendar
            </a>
          </div>

          {/* Manual / Other Apps */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Copy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Other Calendar Apps</h2>
                <p className="text-xs text-muted-foreground">Copy the feed URL and paste it into any calendar app that supports iCal subscriptions</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input readOnly value={feedUrl} className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs text-foreground font-mono truncate" />
              <button
                onClick={copyUrl}
                className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
