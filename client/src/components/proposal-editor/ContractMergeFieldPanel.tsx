// ============================================================
// ContractMergeFieldPanel — right-sidebar click-to-add panel for the
// contract template editor. Mirrors the proposal editor's LibraryPanel
// structure so the two editors feel like siblings.
//
// Click any merge field → appends a `merge_field` block to the document.
// (Future polish: drag-to-canvas + inject-at-cursor when a prose block
// is currently being edited.)
// ============================================================

import { Link } from "wouter";
import { User, Building2, CalendarRange, Sparkles } from "lucide-react";

interface ContractMergeFieldPanelProps {
  onAddField: (fieldKey: string, label: string) => void;
}

interface FieldGroup {
  label: string;
  icon: typeof User;
  fields: Array<{ key: string; label: string; description?: string; isBlock?: boolean }>;
}

const GROUPS: FieldGroup[] = [
  {
    label: "Quick add",
    icon: Sparkles,
    fields: [
      { key: "parties_block", label: "Parties Header", description: "Vendor + Client + collective definition", isBlock: true },
      { key: "packages_block", label: "Selected Packages", description: "Package list with prices", isBlock: true },
    ],
  },
  {
    label: "Client",
    icon: User,
    fields: [
      { key: "client_name", label: "Client Name" },
      { key: "client_email", label: "Client Email" },
      { key: "client_address", label: "Client Address" },
      { key: "client_phone", label: "Client Phone" },
    ],
  },
  {
    label: "Vendor",
    icon: Building2,
    fields: [
      { key: "vendor_name", label: "Vendor Name (Company)" },
      { key: "vendor_signer_name", label: "Owner Name" },
      { key: "vendor_email", label: "Vendor Email" },
      { key: "vendor_address", label: "Vendor Address" },
      { key: "vendor_phone", label: "Vendor Phone" },
    ],
  },
  {
    label: "Event & dates",
    icon: CalendarRange,
    fields: [
      { key: "event_date", label: "Event Date" },
      { key: "event_location", label: "Event Location" },
      { key: "contract_signed_date", label: "Date Signed (today)" },
      { key: "deposit_due_date", label: "Deposit Due Date" },
      { key: "balance_due_date", label: "Balance Due Date" },
      { key: "total_due_date", label: "Total Due Date" },
      { key: "project_title", label: "Project Title" },
    ],
  },
];

export function ContractMergeFieldPanel({ onAddField }: ContractMergeFieldPanelProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Merge fields
        </h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong>Click inside a Text block first</strong>, then tap any chip below to drop the field at your cursor — same way Google Docs / Word handle merge fields. Click a chip with no text block focused and it appends as a new block instead.
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
          <span className="text-emerald-700">Vendor fields auto-fill from <Link to="/settings" className="underline">Settings</Link></span>; client + event fields fill in at signing.
        </p>
      </div>

      {GROUPS.map(group => {
        const GroupIcon = group.icon;
        return (
          <div key={group.label}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <GroupIcon className="w-3 h-3 text-muted-foreground" />
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {group.label}
              </h4>
            </div>
            <div className="space-y-1">
              {group.fields.map(field => (
                <button
                  key={field.key}
                  // mousedown + preventDefault keeps the prose contenteditable
                  // from blurring before the click handler runs, so the saved
                  // caret position stays live for inline insertion.
                  onMouseDown={(e) => { e.preventDefault(); onAddField(field.key, field.label); }}
                  className={`w-full text-left p-2 rounded border transition-colors ${
                    field.isBlock
                      ? "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900"
                      : "bg-card hover:bg-secondary border-border text-foreground"
                  }`}
                  title={field.isBlock
                    ? `Adds ${field.label} as a block`
                    : `Inserts {{${field.key}}} at the cursor (or appends a chip if no text block is focused)`}
                >
                  <p className="text-xs font-medium">{field.isBlock ? "🧩 " : "🔗 "}{field.label}</p>
                  {field.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{field.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div className="text-[10px] text-muted-foreground/70 italic leading-relaxed pt-2 border-t border-border">
        Need to set vendor info? <Link to="/settings" className="text-primary hover:underline">Settings → Business Info</Link>
      </div>
    </div>
  );
}
