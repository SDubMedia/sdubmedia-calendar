// ============================================================
// cleanPastedText — normalize text pasted from PDFs (Canva exports,
// HoneyBook docs, Google Docs PDFs, etc.) so the user doesn't see
// "o f" instead of "of", random NBSPs, double newlines from layout
// breaks, and similar copy-extraction artifacts.
// ============================================================

export function cleanPastedText(raw: string): string {
  if (!raw) return raw;
  let text = raw;

  // 1. Strip invisible / soft characters: zero-width space (U+200B),
  //    zero-width non-joiner (U+200C), zero-width joiner (U+200D),
  //    BOM (U+FEFF), soft hyphen (U+00AD). Unicode escapes (not literal
  //    characters) so eslint's no-irregular-whitespace stays happy.
  text = text.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "");

  // 2. Non-breaking space (U+00A0) → regular space
  text = text.replace(/\u00A0/g, " ");

  // 3. Smart quotes → straight (PDFs often substitute these)
  text = text.replace(/[\u2018\u2019]/g, "'");
  text = text.replace(/[\u201C\u201D]/g, '"');

  // 4. PDF kerning artifact: a run of 2+ consecutive single-letter "words"
  //    separated by single spaces. PDFs sometimes emit "of" as "o f" or
  //    longer chains like "p h o t o" because the renderer encoded the
  //    word as positioned glyphs without word boundaries.
  //
  //    Match: a single letter at a non-letter boundary, followed by 1+
  //    repetitions of "space + single letter", followed by non-letter or
  //    end. Glue them — but only if NONE of the letters is "I" or "a"
  //    (the only real one-letter English words).
  text = text.replace(
    /(?<=^|[^A-Za-z])([A-Za-z])(?:\s([A-Za-z]))+(?=$|[^A-Za-z])/g,
    (match) => {
      const letters = match.split(/\s+/);
      if (letters.some(l => l === "I" || l === "a")) return match;
      return letters.join("");
    },
  );

  // 5. Collapse runs of horizontal whitespace
  text = text.replace(/[ \t]{2,}/g, " ");

  // 6. Collapse 3+ consecutive newlines to 2 (preserve paragraph breaks)
  text = text.replace(/\n{3,}/g, "\n\n");

  // 7. Strip trailing spaces on each line
  text = text.split("\n").map(l => l.trimEnd()).join("\n");

  return text;
}
