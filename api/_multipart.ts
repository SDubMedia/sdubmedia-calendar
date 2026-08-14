// ============================================================
// Pure XML helpers for the S3 multipart flow.
//
// Split out of delivery-multipart.ts so they can be imported by a test. That
// handler builds a Supabase client at module scope, so importing it from a
// test throws before a single assertion runs — which is why the completion XML
// went untested and a double-escaping bug reached production, breaking a 2.7GB
// wedding upload after every byte had already transferred successfully.
//
// Nothing in here touches the network, the database or the environment. Keep
// it that way: the moment it does, it stops being testable and the same class
// of bug gets back in.
// ============================================================

/** Pull a single XML tag's text. R2's responses are small and flat, so this
 *  avoids adding an XML parser dependency for two fields. */
export function xmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Text read out of an XML document is still XML-encoded. An S3 ETag is a
 *  quoted string, so ListParts returns it as `&quot;abc&quot;` — feeding that
 *  straight back into xmlEscape produced `&amp;quot;abc&amp;quot;`, which R2
 *  read as a literal ETag matching nothing, and CompleteMultipartUpload failed
 *  with InvalidPart even though every part was present and correct.
 *
 *  Decode on the way in, encode on the way out. */
export function xmlUnescape(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    // Last, deliberately: doing this first would turn a literal "&amp;quot;"
    // into a real quote instead of the text "&quot;".
    .replace(/&amp;/g, "&");
}

/** The CompleteMultipartUpload request body.
 *
 *  Sorted ascending because S3 rejects an out-of-order part list with a
 *  confusing InvalidPartOrder rather than sorting it for you. */
export function buildCompleteXml(parts: { partNumber: number; etag: string }[]): string {
  return "<CompleteMultipartUpload>"
    + [...parts].sort((a, b) => a.partNumber - b.partNumber)
        .map(p => `<Part><PartNumber>${Number(p.partNumber)}</PartNumber><ETag>${xmlEscape(p.etag)}</ETag></Part>`)
        .join("")
    + "</CompleteMultipartUpload>";
}
