import { describe, it, expect } from "vitest";
import { chipFieldToText, type ChipNode } from "../chipFieldText";

// Minimal stand-ins for DOM nodes — the serializer only reads these fields.
const text = (t: string): ChipNode => ({ nodeType: 3, nodeName: "#text", textContent: t, childNodes: [] });
const el = (nodeName: string, ...childNodes: ChipNode[]): ChipNode => ({ nodeType: 1, nodeName, textContent: null, childNodes });
const br = (): ChipNode => el("BR");
const chip = (token: string): ChipNode => ({ nodeType: 1, nodeName: "SPAN", textContent: "First Name", childNodes: [text("First Name")], dataset: { token } });
const root = (...kids: ChipNode[]): ChipNode => el("DIV", ...kids);

describe("chipFieldToText", () => {
  it("reads flat text with <br> breaks as one newline per <br>", () => {
    expect(chipFieldToText(root(text("Hi,"), br(), br(), text("Your proofs are ready.")))).toBe("Hi,\n\nYour proofs are ready.");
  });

  it("returns a chip's token, not its label", () => {
    expect(chipFieldToText(root(text("Hi "), chip("{{first_name}}"), text(",")))).toBe("Hi {{first_name}},");
  });

  it("turns &nbsp; back into a space", () => {
    expect(chipFieldToText(root(chip("{{first_name}}"), text(" there")))).toBe("{{first_name}} there");
  });

  it("drops the trailing sentinel <br> the editor keeps behind the caret", () => {
    expect(chipFieldToText(root(text("Thanks,"), br(), br()))).toBe("Thanks,\n");
  });

  it("counts two Enters at the end as one blank line, not zero and not two", () => {
    // text<br><br><br(sentinel)>
    expect(chipFieldToText(root(text("Thanks,"), br(), br(), br()))).toBe("Thanks,\n\n");
  });

  describe("when the browser answers Enter with <div> blocks", () => {
    it("reads consecutive blocks as one line each", () => {
      expect(chipFieldToText(root(el("DIV", text("line one")), el("DIV", text("line two"))))).toBe("line one\nline two");
    });

    it("reads <div><br></div> as exactly one empty line", () => {
      const dom = root(el("DIV", text("Hi,")), el("DIV", br()), el("DIV", text("Bye")));
      expect(chipFieldToText(dom)).toBe("Hi,\n\nBye");
    });

    it("ignores a placeholder <br> at the end of a block with text", () => {
      const dom = root(el("DIV", text("Hi,"), br()), el("DIV", text("Bye")));
      expect(chipFieldToText(dom)).toBe("Hi,\nBye");
    });

    it("does not invent a leading newline when the first thing is a block", () => {
      expect(chipFieldToText(root(el("DIV", text("Hi")), el("DIV", text("Bye"))))).toBe("Hi\nBye");
    });

    it("starts a new line for a block that follows root-level text", () => {
      expect(chipFieldToText(root(text("Hi"), el("DIV", text("Bye"))))).toBe("Hi\nBye");
    });

    it("handles chips inside blocks", () => {
      const dom = root(el("DIV", text("Hi "), chip("{{first_name}}"), text(",")), el("DIV", br()), el("DIV", text("Bye")));
      expect(chipFieldToText(dom)).toBe("Hi {{first_name}},\n\nBye");
    });
  });

  it("returns an empty string for an empty field", () => {
    expect(chipFieldToText(root())).toBe("");
    expect(chipFieldToText(root(br()))).toBe("");
  });
});
