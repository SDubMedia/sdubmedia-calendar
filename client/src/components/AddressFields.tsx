// ============================================================
// The standard address capture: venue name, street, city, state, zip.
//
// STANDARD: any Slate surface that asks where something happens uses this —
// never a single free-text "where" box. A free-text box can't be put on a map,
// can't be reformatted for an email, and drifts in shape between screens; we
// had five different address renderings before this. See CLAUDE.md.
//
// Pair it with `composeAddress()` from lib/address to produce the one-line form
// that gets stored and displayed downstream.
// ============================================================

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AddressParts } from "@/lib/address";
import { parsePastedAddress } from "@/lib/utils";

interface Props {
  value: AddressParts;
  onChange: (next: AddressParts) => void;
  /** Hide the venue-name row where a place has no name (a home address). */
  showVenueName?: boolean;
  disabled?: boolean;
  /** Shown under the fields — say where this address will end up. */
  hint?: string;
}

export default function AddressFields({
  value, onChange, showVenueName = true, disabled, hint,
}: Props) {
  const set = (k: keyof AddressParts) => (v: string) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-2">
      {showVenueName && (
        <div>
          <Label className="text-xs text-muted-foreground">Venue name</Label>
          <Input
            value={value.locationName ?? ""}
            onChange={e => set("locationName")(e.target.value)}
            placeholder="Harlinsdale Farm"
            disabled={disabled}
            className="bg-secondary border-border mt-1"
          />
        </div>
      )}
      <div>
        <Label className="text-xs text-muted-foreground">Street address</Label>
        <Input
          value={value.address ?? ""}
          onChange={e => set("address")(e.target.value)}
          // Pasting a whole address into the street box splits it across the
          // fields, so copying one off a text message is a single action rather
          // than five. Only fires when the paste actually parses — otherwise it
          // behaves like a normal paste.
          onPaste={e => {
            const text = e.clipboardData.getData("text");
            if (!text.includes(",")) return;
            const parsed = parsePastedAddress(text);
            if (parsed.city || parsed.state || parsed.zip) {
              e.preventDefault();
              onChange({
                ...value,
                address: parsed.address,
                city: parsed.city || value.city,
                state: parsed.state || value.state,
                zip: parsed.zip || value.zip,
              });
            }
          }}
          placeholder="239 Franklin Rd"
          disabled={disabled}
          className="bg-secondary border-border mt-1"
        />
      </div>
      {/* City takes the room it needs; state and zip are short and fixed, so
          they share the row rather than each eating a full line on a phone. */}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">City</Label>
          <Input
            value={value.city ?? ""}
            onChange={e => set("city")(e.target.value)}
            placeholder="Franklin"
            disabled={disabled}
            className="bg-secondary border-border mt-1"
          />
        </div>
        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">State</Label>
          <Input
            value={value.state ?? ""}
            onChange={e => set("state")(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="TN"
            maxLength={2}
            disabled={disabled}
            className="bg-secondary border-border mt-1"
          />
        </div>
        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">ZIP</Label>
          {/* text + inputMode, not type="number" — the iOS numeric keypad has no
              Done button. Codebase-wide convention. */}
          <Input
            value={value.zip ?? ""}
            onChange={e => set("zip")(e.target.value.replace(/[^0-9-]/g, "").slice(0, 10))}
            inputMode="numeric"
            placeholder="37064"
            disabled={disabled}
            className="bg-secondary border-border mt-1"
          />
        </div>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
