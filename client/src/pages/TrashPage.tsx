// ============================================================
// TrashPage — Recover deleted contracts, proposals, templates, invoices
// ============================================================

import { useState, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/lib/supabase";
import { Trash2, RotateCcw, X, FileText, Receipt, Users } from "lucide-react";
import { toast } from "sonner";

interface TrashItem {
  id: string;
  table: string;
  type: string;
  name: string;
  deletedAt: string;
}

const TABLES = [
  { table: "contract_templates", type: "Contract Template", nameField: "name" },
  { table: "contracts", type: "Contract", nameField: "title" },
  { table: "proposal_templates", type: "Proposal Template", nameField: "name" },
  { table: "proposals", type: "Proposal", nameField: "title" },
  { table: "invoices", type: "Invoice", nameField: "invoice_number" },
  { table: "pipeline_leads", type: "Pipeline Lead", nameField: "name" },
];

export default function TrashPage() {
  const { restoreItem, permanentlyDelete } = useApp();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTrash() {
    setLoading(true);
    const allItems: TrashItem[] = [];

    for (const { table, type, nameField } of TABLES) {
      try {
        const { data } = await supabase
          .from(table)
          .select("*")
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false });

        if (data) {
          for (const row of data as any[]) {
            allItems.push({
              id: row.id,
              table,
              type,
              name: row[nameField] || "Untitled",
              deletedAt: row.deleted_at,
            });
          }
        }
      } catch {
        // Table might not have deleted_at yet, skip
      }
    }

    allItems.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    setItems(allItems);
    setLoading(false);
  }

  useEffect(() => { loadTrash(); }, []);

  async function handleRestore(item: TrashItem) {
    try {
      await restoreItem(item.table, item.id);
      setItems(items.filter(i => i.id !== item.id));
      toast.success(`"${item.name}" restored`);
    } catch (e: any) {
      toast.error(e.message || "Failed to restore");
    }
  }

  async function handlePermanentDelete(item: TrashItem) {
    if (!confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await permanentlyDelete(item.table, item.id);
      setItems(items.filter(i => i.id !== item.id));
      toast.success("Permanently deleted");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  }

  // Snapshot "now" once per page mount via the lazy useState initializer
  // (runs once, not on every render). Time-ago labels are intentionally a
  // frozen view of when the trash was loaded, not a live ticker.
  const [nowSnapshot] = useState(() => Date.now());

  function formatTimeAgo(dateStr: string): string {
    const diff = nowSnapshot - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  const TYPE_ICONS: Record<string, any> = {
    "Contract Template": FileText,
    "Contract": FileText,
    "Proposal Template": FileText,
    "Proposal": FileText,
    "Invoice": Receipt,
    "Pipeline Lead": Users,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <Trash2 className="w-5 h-5 text-muted-foreground" />
            Trash
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{items.length} deleted item{items.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading trash...
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Trash2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Trash is empty</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => {
              const Icon = TYPE_ICONS[item.type] || FileText;
              return (
                <div key={`${item.table}-${item.id}`} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.type} · Deleted {formatTimeAgo(item.deletedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleRestore(item)} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors">
                      <RotateCcw className="w-3 h-3" /> Restore
                    </button>
                    <button onClick={() => handlePermanentDelete(item)} className="flex items-center gap-1 text-xs px-2 py-1 rounded text-muted-foreground hover:text-red-400 transition-colors">
                      <X className="w-3 h-3" /> Delete Forever
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
