// ============================================================
// MyHousesPage — the agent's home. Lists their listings/shoots (date, time,
// address, status), shows the status of any requests they've submitted, and
// lets them request a new shoot. Agent-safe: no cost/margin, only their own.
// ============================================================

import { useMemo, useState } from "react";
import { Home, Plus, Clock, MapPin, CheckCircle2, Hourglass, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import RequestShootDialog from "@/components/RequestShootDialog";

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(t: string): string {
  const [hs, m] = (t || "").split(":");
  const h = Number(hs); if (Number.isNaN(h)) return t || "";
  const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

export default function MyHousesPage() {
  const { data } = useApp();
  const { effectiveProfile } = useAuth();
  const [requestOpen, setRequestOpen] = useState(false);

  const myClientId = effectiveProfile?.clientIds?.[0] ?? "";

  const houses = useMemo(
    () => [...data.projects].sort((a, b) => b.date.localeCompare(a.date)),
    [data.projects]
  );
  const pending = useMemo(() => data.shootRequests.filter(r => r.status === "pending"), [data.shootRequests]);
  const declined = useMemo(() => data.shootRequests.filter(r => r.status === "declined"), [data.shootRequests]);

  const locName = (locationId: string) => data.locations.find(l => l.id === locationId)?.name ?? "Address TBD";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>My Houses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{houses.length} shoot{houses.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setRequestOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Request a shoot
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 max-w-2xl w-full mx-auto space-y-6">
        {/* Pending requests */}
        {pending.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Hourglass className="w-3 h-3" /> Awaiting confirmation</div>
            <div className="space-y-2">
              {pending.map(r => (
                <div key={r.id} className="bg-card border border-amber-500/30 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{r.propertyAddress}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(r.preferredDate ?? "")}{r.preferredTime ? ` · ${fmtTime(r.preferredTime)}` : ""}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{r.requestedServices.map(s => s.label).join(", ")}</div>
                    </div>
                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30 flex-shrink-0">Pending</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Declined requests */}
        {declined.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><XCircle className="w-3 h-3" /> Couldn't schedule</div>
            <div className="space-y-2">
              {declined.map(r => (
                <div key={r.id} className="bg-card border border-border rounded-lg p-3">
                  <div className="text-sm font-medium text-foreground truncate">{r.propertyAddress}</div>
                  {r.ownerResponse && <div className="text-xs text-muted-foreground mt-0.5">{r.ownerResponse}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scheduled houses */}
        <div>
          {(pending.length > 0 || declined.length > 0) && houses.length > 0 && (
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Scheduled</div>
          )}
          {houses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Home className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No shoots yet. Request your first one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {houses.map(p => (
                <div key={p.id} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Home className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate flex items-center gap-1"><MapPin className="w-3 h-3 flex-shrink-0 text-muted-foreground" />{locName(p.locationId)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(p.date)}{p.startTime ? ` · ${fmtTime(p.startTime)}` : ""}</div>
                  </div>
                  <Badge variant="outline" className="border-border text-muted-foreground capitalize flex-shrink-0">{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <RequestShootDialog open={requestOpen} onClose={() => setRequestOpen(false)} clientId={myClientId} />
    </div>
  );
}
