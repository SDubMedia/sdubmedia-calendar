// ============================================================
// usePasteCleaner — small hook that returns an onPaste handler for
// <input> / <textarea> elements. Cleans the pasted text via
// cleanPastedText() and inserts it at the cursor, preserving any
// existing selection/replace behaviour.
// ============================================================

import { useCallback } from "react";
import { cleanPastedText } from "./cleanPaste";

type AnyTextEl = HTMLInputElement | HTMLTextAreaElement;

export function usePasteCleaner(onChange: (next: string) => void) {
  return useCallback(
    (e: React.ClipboardEvent<AnyTextEl>) => {
      const pasted = e.clipboardData.getData("text/plain");
      if (!pasted) return;
      const cleaned = cleanPastedText(pasted);
      // If cleaning didn't change anything, let the browser handle the paste
      // normally — preserves native undo behaviour.
      if (cleaned === pasted) return;
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const next = target.value.slice(0, start) + cleaned + target.value.slice(end);
      onChange(next);
      // Restore caret position past the inserted text. requestAnimationFrame
      // gives React time to flush the new value into the DOM.
      requestAnimationFrame(() => {
        try {
          target.selectionStart = target.selectionEnd = start + cleaned.length;
        } catch {
          // Some inputs (e.g., type=number) reject selection set; ignore.
        }
      });
    },
    [onChange],
  );
}
