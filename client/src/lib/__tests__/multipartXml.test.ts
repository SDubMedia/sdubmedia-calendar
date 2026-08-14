import { describe, it, expect } from "vitest";
// Imports the REAL function from the API handler. The double-escaping bug that
// broke a 2.7GB wedding upload in production got through because the test
// rebuilt this XML itself, so it tested a copy of the logic instead of the
// logic. Import it, don't reimplement it.
import { buildCompleteXml } from "../../../../api/_multipart";

// Exactly what R2's ListParts returns: the ETag is a quoted string, so the
// quotes arrive XML-encoded.
const R2_ETAG_AS_LISTED = '&quot;08b46181d7094b5ece88bb389c7499af&quot;';
const R2_ETAG_DECODED = '"08b46181d7094b5ece88bb389c7499af"';

describe("buildCompleteXml", () => {
  it("emits the ETag with quotes encoded exactly once", () => {
    const xml = buildCompleteXml([{ partNumber: 1, etag: R2_ETAG_DECODED }]);
    expect(xml).toContain(`<ETag>${R2_ETAG_AS_LISTED}</ETag>`);
    // The regression: &amp;quot; is what R2 rejected with InvalidPart.
    expect(xml).not.toContain("&amp;quot;");
  });

  it("sorts parts ascending — S3 rejects an out-of-order list", () => {
    const xml = buildCompleteXml([
      { partNumber: 3, etag: '"c"' },
      { partNumber: 1, etag: '"a"' },
      { partNumber: 2, etag: '"b"' },
    ]);
    expect(xml.indexOf("<PartNumber>1<")).toBeLessThan(xml.indexOf("<PartNumber>2<"));
    expect(xml.indexOf("<PartNumber>2<")).toBeLessThan(xml.indexOf("<PartNumber>3<"));
  });

  it("does not mutate the array it is given", () => {
    const parts = [{ partNumber: 2, etag: '"b"' }, { partNumber: 1, etag: '"a"' }];
    buildCompleteXml(parts);
    expect(parts[0].partNumber).toBe(2);
  });

  it("produces one Part element per part", () => {
    const parts = Array.from({ length: 82 }, (_, i) => ({ partNumber: i + 1, etag: `"e${i}"` }));
    const xml = buildCompleteXml(parts);
    expect((xml.match(/<Part>/g) || []).length).toBe(82);
    expect(xml.startsWith("<CompleteMultipartUpload>")).toBe(true);
    expect(xml.endsWith("</CompleteMultipartUpload>")).toBe(true);
  });
});
