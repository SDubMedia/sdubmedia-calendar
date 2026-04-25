import { useEffect, useRef } from "react";
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

// Convert legacy plain-text contract bodies into HTML the editor can load.
// Detects all-caps lines as headings (h1 for the first, h2 for subsequent).
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  if (isHtml(text)) return text;

  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let buffer: string[] = [];
  let sawAnyContent = false;

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
    const isAllCapsHeading =
      /^[\s\d.]*[A-Z][A-Z0-9\s.,&'\-—–]*$/.test(trimmed) &&
      trimmed.length < 90 &&
      !trimmed.endsWith(".");
    if (isAllCapsHeading) {
      flushParagraph();
      const tag = !sawAnyContent ? "h1" : "h2";
      out.push(`<${tag}>${wrapMergeFields(escapeHtml(trimmed))}</${tag}>`);
    } else {
      buffer.push(wrapMergeFields(escapeHtml(line)));
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

export function WysiwygContractEditor({ value, onChange, placeholder, minHeight = "50vh" }: Props) {
  // Hold the latest value in a ref so the onUpdate callback isn't a dep
  // of the editor (which would re-instantiate every render).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: placeholder || "Start typing or paste your contract..." }),
      MergeFieldChip,
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

  if (!editor) {
    return <div className="bg-secondary border border-border rounded-md" style={{ minHeight }} />;
  }

  const insertMergeField = (field: string) => {
    editor.chain().focus().insertContent({ type: "mergeField", attrs: { field } }).run();
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
