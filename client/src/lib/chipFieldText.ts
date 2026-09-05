// ============================================================
// Reading plain text back out of the ChipField contenteditable
// (DeliveriesPage's email composer).
//
// The field is seeded as flat text + <br> (toChips), but a browser is free
// to answer an Enter with <div> blocks, to leave a placeholder <br> at the
// end of a block, and WebKit never draws a lone trailing <br> at all. Each
// of those made "how many newlines did she type" come out wrong — double
// Enter read as three, a blank line at the end vanished. This maps the DOM
// the browser actually built back to the text she meant, one "\n" per line
// break. Typed against a structural node shape so it can be unit-tested
// without a DOM.
// ============================================================

export interface ChipNode {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<ChipNode>;
  dataset?: { token?: string };
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const isBr = (n: ChipNode | undefined) => !!n && n.nodeName.toUpperCase() === "BR";

export function chipFieldToText(root: ChipNode): string {
  const walk = (node: ChipNode, hasPrevSibling: boolean): string => {
    if (node.nodeType === TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== ELEMENT_NODE) return "";
    // A chip is atomic: its token, never its label.
    const token = node.dataset?.token;
    if (token) return token;
    const name = node.nodeName.toUpperCase();
    if (name === "BR") return "\n";
    const kids = Array.from(node.childNodes);
    const isBlock = name === "DIV" || name === "P";
    // A <br> that ENDS a block is the browser's placeholder so the block has
    // height — <div><br></div> is one empty line, not two breaks.
    if (isBlock && isBr(kids[kids.length - 1])) kids.pop();
    let out = kids.map((k, i) => walk(k, i > 0)).join("");
    // A block starts a new line — unless it's the very first thing.
    if (isBlock && hasPrevSibling) out = "\n" + out;
    return out;
  };

  const kids = Array.from(root.childNodes);
  // A trailing <br> at the root is never drawn as a line (WebKit), so the
  // editor keeps one behind the caret as a sentinel. It isn't a newline.
  if (isBr(kids[kids.length - 1])) kids.pop();
  return kids.map((k, i) => walk(k, i > 0)).join("").replace(/\u00a0/g, " ");
}
