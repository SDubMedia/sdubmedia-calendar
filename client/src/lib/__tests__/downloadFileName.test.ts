import { describe, it, expect } from "vitest";
import { downloadFileName } from "../../../../api/_r2";

describe("downloadFileName", () => {
  it("names a served raw original by its real extension, not the browse copy's", () => {
    expect(downloadFileName("Untitled0019.jpg", "org/x/originals/m85-Untitled0019.ARW")).toBe("Untitled0019.ARW");
    expect(downloadFileName("DSC_0001.jpg", "org/x/originals/ab-DSC_0001.NEF")).toBe("DSC_0001.NEF");
  });
  it("leaves a name alone when the served file has the same extension", () => {
    expect(downloadFileName("Felicia Long 2.jpeg", "org/x/w8-Felicia_Long_2.jpeg")).toBe("Felicia Long 2.jpeg");
    expect(downloadFileName("clip.mov", "org/x/clip.mov")).toBe("clip.mov");
  });
  it("falls back sanely", () => {
    expect(downloadFileName(null, "org/x/abc.ARW")).toBe("download.ARW");
    expect(downloadFileName("noext", "org/x/key-without-extension")).toBe("noext");
    expect(downloadFileName('quo"te.jpg', "org/x/q.ARW")).toBe("quote.ARW");
  });
});
