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

import { useRef } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AddressParts } from "@/lib/address";
import { cn, parsePastedAddress } from "@/lib/utils";

/**
 * An input with a one-tap clear.
 *
 * Replacing a venue name on a phone otherwise means holding backspace through
 * "Harlinsdale Farm" one letter at a time. The × empties it in a single tap and
 * hands focus straight back, so the next thing typed goes into an empty field.
 *
 * Rewiring backspace itself to clear the line was the other option and is worse:
 * it would make fixing a single typo impossible.
 */
function ClearableInput({
  value, onChange, disabled, label, ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const ref = useRef<HTMLInputElement>(null);
  const showClear = !disabled && value.length > 0;
  return (
    <div className="relative">
      <Input
        {...rest}
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={cn("bg-secondary border-border mt-1", showClear && "pr-9", rest.className)}
      />
      {showClear && (
        <button
          type="button"
          // onMouseDown, not onClick — the input would otherwise lose focus and
          // dismiss the keyboard before the tap registers.
          onMouseDown={e => { e.preventDefault(); onChange(""); ref.current?.focus(); }}
          aria-label={`Clear ${label}`}
          className="absolute right-1 top-1 h-[calc(100%-0.25rem)] w-8 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

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
          <ClearableInput
            label="venue name"
            value={value.locationName ?? ""}
            onChange={set("locationName")}
            placeholder="Harlinsdale Farm"
            disabled={disabled}
          />
        </div>
      )}
      <div>
        <Label className="text-xs text-muted-foreground">Street address</Label>
        <ClearableInput
          label="street address"
          value={value.address ?? ""}
          onChange={set("address")}
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
        />
      </div>
      {/* City takes the room it needs; state and zip are short and fixed, so
          they share the row rather than each eating a full line on a phone. */}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">City</Label>
          <ClearableInput
            label="city"
            value={value.city ?? ""}
            onChange={set("city")}
            placeholder="Franklin"
            disabled={disabled}
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
