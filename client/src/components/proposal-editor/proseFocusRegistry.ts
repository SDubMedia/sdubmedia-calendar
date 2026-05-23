// ============================================================
// proseFocusRegistry — module-singleton tracking the most recently
// focused prose contenteditable in the active editor + the user's last
// caret position inside it.
//
// Lets the right-sidebar merge-field panel inject `{{field}}` at the
// cursor instead of appending a new block. Saved on every selection
// change inside the prose; cleared on unmount. We deliberately do NOT
// clear on blur — clicking a sidebar chip blurs the contenteditable,
// and we still want the saved range to be live so we can restore it
// and insert at the right spot.
// ============================================================

let activeRef: HTMLDivElement | null = null;
let savedRange: Range | null = null;

export function registerProseEditor(el: HTMLDivElement | null): void {
  activeRef = el;
}

export function saveProseSelection(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (activeRef && activeRef.contains(range.startContainer)) {
    savedRange = range.cloneRange();
  }
}

/**
 * Insert a styled merge-field chip at the saved caret position inside the
 * active prose editor. Returns true on success, false if no prose editor
 * is currently registered (caller should fall back to appending a block).
 *
 * The chip is `contenteditable="false"` so the browser treats it as an
 * atomic unit (backspace deletes the whole chip, arrow keys jump over).
 */
export function insertIntoActiveProse(field: string, label: string): boolean {
  if (!activeRef) return false;
  activeRef.focus();
  const sel = window.getSelection();
  if (!sel) return false;
  if (savedRange) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
  if (sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  range.deleteContents();

  const chip = document.createElement("span");
  chip.className = "merge-chip merge-chip-placeholder";
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute("data-field", field);
  chip.textContent = label;
  range.insertNode(chip);

  // Drop a non-breaking space after the chip so the cursor isn't trapped
  // at the chip's right edge — the user can immediately keep typing.
  const after = document.createTextNode(" ");
  range.setStartAfter(chip);
  range.insertNode(after);
  range.setStartAfter(after);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  saveProseSelection();
  return true;
}

export function clearActiveProse(el: HTMLDivElement): void {
  if (activeRef === el) {
    activeRef = null;
    savedRange = null;
  }
}
