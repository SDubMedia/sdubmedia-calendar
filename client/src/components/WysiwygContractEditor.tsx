import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Node, mergeAttributes } from "@tiptap/core";
import { Bold as BoldIcon, Italic as ItalicIcon, List, ListOrdered, Heading2, Heading3 } from "lucide-react";
import { cn } from "@/lib/utils";

// Merge field metadata used to color-code chips and group the picker.
type MergeGroup = "client" | "project" | "you" | "date";

const MERGE_FIELDS: { key: string; label: string; group: MergeGroup }[] = [
  { key: "client_name", label: "Client Name", group: "client" },
  { key: "client_company", label: "Client Company", group: "client" },
  { key: "client_email", label: "Client Email", group: "client" },
  { key: "project_type", label: "Project Type", group: "project" },
  { key: "project_date", label: "Project Date", group: "project" },
  { key: "project_location", label: "Location", group: "project" },
  { key: "date", label: "Today's Date", group: "date" },
  { key: "owner_name", label: "Your Name", group: "you" },
  { key: "company_name", label: "Your Company", group: "you" },
];

const FIELD_TO_GROUP: Record<string, MergeGroup> = Object.fromEntries(
  MERGE_FIELDS.map(f => [f.key, f.group])
);

const GROUP_BUTTON_CLASS: Record<MergeGroup, string> = {
  client: "bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25",
  project: "bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25",
  you: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25",
  date: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30 hover:bg-zinc-500/25",
};

const GROUP_LABEL: Record<MergeGroup, string> = {
  client: "From client",
  project: "From project",
  you: "From you",
  date: "Auto",
};

// Custom Tiptap node — a bracketed-field chip stands in for `[PURPOSE — what
// are you discussing?]`-style placeholders in seeded templates. Atomic so
// the cursor can't land inside; click opens a popover to fill the value.
const BracketedFieldChip = Node.create({
  name: "bracketField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      placeholder: { default: "" },  // the original hint text from inside the brackets
      value: { default: "" },         // user-entered value; empty = unfilled
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-bracket-field]",
        getAttrs: (el) => ({
          placeholder: (el as HTMLElement).getAttribute("data-placeholder") || "",
          value: (el as HTMLElement).getAttribute("data-value") || "",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const placeholder = node.attrs.placeholder as string;
    const value = node.attrs.value as string;
    const filled = !!value;
    const display = filled ? value : `[${placeholder}]`;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-bracket-field": "",
        "data-placeholder": placeholder,
        "data-value": value,
        class: filled ? "bracket-chip bracket-chip-filled" : "bracket-chip bracket-chip-empty",
      }),
      display,
    ];
  },
});

// Custom Tiptap node — a merge field chip is atomic, inline, non-editable.
const MergeFieldChip = Node.create({
  name: "mergeField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      field: { default: null as string | null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-merge-field]",
        getAttrs: (el) => ({
          field: (el as HTMLElement).getAttribute("data-merge-field"),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const field = node.attrs.field as string | null;
    const group = (field && FIELD_TO_GROUP[field]) || "date";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-merge-field": field,
        class: `merge-field-chip merge-field-${group}`,
      }),
      `{{${field}}}`,
    ];
  },
});

// Detect whether a string already looks like HTML.
function isHtml(s: string): boolean {
  return /<(p|h[1-6]|ul|ol|li|br|strong|em|span)\b/i.test(s);
}

// Escape only what's needed for safe text injection — preserves {{merge}}
// tokens for downstream chip wrapping.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapMergeFields(escapedText: string): string {
  return escapedText.replace(/\{\{(\w+)\}\}/g, (_, field) => {
    const group = FIELD_TO_GROUP[field] || "date";
    return `<span data-merge-field="${field}" class="merge-field-chip merge-field-${group}">{{${field}}}</span>`;
  });
}

// Wrap `[BRACKETED HINT]` text as a clickable chip placeholder. Must start
// with a capital letter so we don't false-match `[1.]` or `[item]`.
function wrapBracketFields(escapedText: string): string {
  return escapedText.replace(/\[([A-Z][^\]]{0,250})\]/g, (_, content) => {
    const attrSafe = String(content).replace(/"/g, "&quot;");
    return `<span data-bracket-field="" data-placeholder="${attrSafe}" data-value="" class="bracket-chip bracket-chip-empty">[${content}]</span>`;
  });
}

// Wrap brackets in already-HTML content while skipping any that are already
// inside a chip span — so existing wraps survive a re-load.
function wrapBracketFieldsInHtml(html: string): string {
  const parts = html.split(/(<span\s+data-bracket-field[^>]*>[\s\S]*?<\/span>)/);
  return parts.map((part, i) => (i % 2 === 1 ? part : wrapBracketFields(part))).join("");
}

// Convert legacy plain-text contract bodies into HTML the editor can load.
// Detects all-caps lines as headings (h1 for the first, h2 for subsequent).
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  if (isHtml(text)) return wrapBracketFieldsInHtml(text);

  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let buffer: string[] = [];
  let sawAnyContent = false;

  const wrapAll = (s: string) => wrapBracketFields(wrapMergeFields(s));

  const flushParagraph = () => {
    if (buffer.length === 0) return;
    out.push(`<p>${buffer.join("<br>")}</p>`);
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    // ALL-CAPS heading detection — but skip lines that are bracketed
    // placeholders (e.g. `[FEE]`), which look all-caps but are content.
    const isAllCapsHeading =
      !trimmed.startsWith("[") &&
      /^[\s\d.]*[A-Z][A-Z0-9\s.,&'\-—–]*$/.test(trimmed) &&
      trimmed.length < 90 &&
      !trimmed.endsWith(".");
    if (isAllCapsHeading) {
      flushParagraph();
      const tag = !sawAnyContent ? "h1" : "h2";
      out.push(`<${tag}>${wrapAll(escapeHtml(trimmed))}</${tag}>`);
    } else {
      buffer.push(wrapAll(escapeHtml(line)));
    }
    sawAnyContent = true;
  }
  flushParagraph();

  return out.join("\n");
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

// Bracket chip popover state — tracked at parent level so we can position
// a single floating editor near the clicked chip.
interface BracketEditState {
  pos: number;
  placeholder: string;
  value: string;
  rect: DOMRect;
}

export function WysiwygContractEditor({ value, onChange, placeholder, minHeight = "50vh" }: Props) {
  // Hold the latest onChange in a ref so the editor's onUpdate callback
  // doesn't need to be re-bound when the parent's onChange identity changes.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [bracketEdit, setBracketEdit] = useState<BracketEditState | null>(null);
  const [bracketDraft, setBracketDraft] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: placeholder || "Start typing or paste your contract..." }),
      MergeFieldChip,
      BracketedFieldChip,
    ],
    content: plainTextToHtml(value || ""),
    editorProps: {
      attributes: {
        class: "prose prose-invert prose-sm max-w-none focus:outline-none px-4 py-3 contract-editor",
      },
    },
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getHTML());
    },
  });

  // Sync external value changes (e.g. PDF upload, template applied) into the editor.
  // Compare against current editor HTML to avoid loops on our own onUpdate emissions.
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    const incoming = plainTextToHtml(value || "");
    if (incoming !== currentHtml) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [value, editor]);

  // Click handler for bracket chips — opens the popover positioned over the chip.
  // Wired through useEffect so it sees the live editor instance.
  useEffect(() => {
    if (!editor) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const chip = target.closest("[data-bracket-field]") as HTMLElement | null;
      if (!chip) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = editor.view.posAtDOM(chip, 0);
      const node = editor.state.doc.nodeAt(pos);
      if (!node || node.type.name !== "bracketField") return;
      setBracketEdit({
        pos,
        placeholder: node.attrs.placeholder,
        value: node.attrs.value,
        rect: chip.getBoundingClientRect(),
      });
      setBracketDraft(node.attrs.value);
    };
    const dom = editor.view.dom;
    dom.addEventListener("click", handleClick);
    return () => dom.removeEventListener("click", handleClick);
  }, [editor]);

  if (!editor) {
    return <div className="bg-secondary border border-border rounded-md" style={{ minHeight }} />;
  }

  const insertMergeField = (field: string) => {
    editor.chain().focus().insertContent({ type: "mergeField", attrs: { field } }).run();
  };

  const saveBracket = () => {
    if (!editor || !bracketEdit) return;
    const tr = editor.state.tr.setNodeMarkup(bracketEdit.pos, undefined, {
      placeholder: bracketEdit.placeholder,
      value: bracketDraft,
    });
    editor.view.dispatch(tr);
    setBracketEdit(null);
  };

  const clearBracket = () => {
    if (!editor || !bracketEdit) return;
    const tr = editor.state.tr.setNodeMarkup(bracketEdit.pos, undefined, {
      placeholder: bracketEdit.placeholder,
      value: "",
    });
    editor.view.dispatch(tr);
    setBracketEdit(null);
  };

  return (
    <div className="bg-secondary border border-border rounded-md overflow-hidden">
      {/* Formatting toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card/50">
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-border mx-1" />
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <BoldIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <ItalicIcon className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-border mx-1" />
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Merge field picker */}
      <div className="border-b border-border bg-card/30 px-3 py-2 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Insert merge field</p>
        {(["client", "project", "you", "date"] as MergeGroup[]).map(group => {
          const fields = MERGE_FIELDS.filter(f => f.group === group);
          if (fields.length === 0) return null;
          return (
            <div key={group} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 w-20 shrink-0">{GROUP_LABEL[group]}</span>
              <div className="flex flex-wrap gap-1">
                {fields.map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => insertMergeField(f.key)}
                    className={cn("text-[11px] px-2 py-0.5 rounded-md border transition-colors font-medium", GROUP_BUTTON_CLASS[f.group])}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Editor surface */}
      <div className="bg-secondary" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>

      {/* Bracket-field edit popover — fixed-positioned overlay near the chip */}
      {bracketEdit && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setBracketEdit(null)}
          />
          <div
            className="fixed z-50 bg-card border border-border rounded-lg shadow-xl p-3 w-[min(380px,calc(100vw-24px))]"
            style={(() => {
              // Position above the chip if it's in the bottom 50% of viewport
              // (where the iOS keyboard would otherwise cover the popover).
              const popoverHeight = 200;
              const margin = 8;
              const room = window.innerHeight - bracketEdit.rect.bottom;
              const placeBelow = room > popoverHeight + margin;
              const top = placeBelow
                ? bracketEdit.rect.bottom + margin
                : Math.max(margin, bracketEdit.rect.top - popoverHeight - margin);
              return {
                top,
                left: Math.max(12, Math.min(bracketEdit.rect.left, window.innerWidth - 392)),
              };
            })()}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-1">Fill in</p>
            <p className="text-sm text-foreground/85 mb-2 leading-snug">{bracketEdit.placeholder}</p>
            <input
              autoFocus
              type="text"
              value={bracketDraft}
              onChange={(e) => setBracketDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); saveBracket(); }
                else if (e.key === "Escape") { e.preventDefault(); setBracketEdit(null); }
              }}
              placeholder="Type the value..."
              // 16px font-size prevents iOS Safari from auto-zooming the
              // viewport on focus. Don't go below this on touch surfaces.
              style={{ fontSize: "16px" }}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex items-center justify-between mt-3 gap-2">
              <button
                type="button"
                onClick={clearBracket}
                className="text-xs text-muted-foreground hover:text-foreground py-2 px-1"
                disabled={!bracketEdit.value}
              >
                Clear
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setBracketEdit(null)}
                  className="text-sm px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveBracket}
                  className="text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors",
        active && "bg-primary/15 text-primary"
      )}
    >
      {children}
    </button>
  );
}
