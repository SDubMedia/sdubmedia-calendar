// Website lead-form embed card (Settings).
//
// Gives each owner a self-contained, copy-paste HTML contact form keyed to
// their org slug. Pasted into any site builder's HTML/embed block
// (Pixieset, HoneyBook, Squarespace, etc.), submissions POST to the public
// capture endpoint and land in this org's pipeline at the Inquiry stage,
// with the same owner notification + visitor auto-reply as everything else.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Code2, Copy, Check } from "lucide-react";

const CAPTURE_ENDPOINT = "https://slate.sdubmedia.com/api/capture-pipeline-lead";

// Build the paste-able snippet. Uses f.elements[name] (not f.name) to avoid
// the HTMLFormElement.name collision, and an inline honeypot field.
function buildSnippet(slug: string): string {
  const field = (label: string, name: string, type = "text", required = false) =>
    `  <label style="display:block;font:14px sans-serif;margin:12px 0 4px;">${label}</label>
  <input name="${name}" type="${type}"${required ? " required" : ""} style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font:15px sans-serif;">`;

  return `<!-- Contact form — submissions go straight to your Slate pipeline -->
<form id="slate-lead-form" style="max-width:480px;margin:0 auto;">
${field("Name", "name", "text", true)}
${field("Email", "email", "email", true)}
${field("Phone", "phone", "tel")}
  <label style="display:block;font:14px sans-serif;margin:12px 0 4px;">What are you planning?</label>
  <select name="planning" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font:15px sans-serif;">
    <option value="">Select one</option>
    <option>Recurring content</option>
    <option>Event coverage</option>
    <option>Brand video</option>
    <option>Wedding</option>
    <option>Other</option>
  </select>
${field("Event date & time (if any)", "eventDateTime", "datetime-local")}
  <label style="display:block;font:14px sans-serif;margin:12px 0 4px;">Anything else?</label>
  <textarea name="message" rows="4" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font:15px sans-serif;"></textarea>
  <input name="company" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;">
  <button type="submit" style="margin-top:16px;width:100%;padding:12px;border:0;border-radius:6px;background:#2563eb;color:#fff;font:600 15px sans-serif;cursor:pointer;">Send it over</button>
  <p id="slate-lead-status" style="margin-top:12px;font:14px sans-serif;text-align:center;"></p>
</form>
<script>
(function(){
  var f=document.getElementById('slate-lead-form');
  if(!f)return;
  var g=function(n){var el=f.elements[n];return el?el.value:'';};
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var s=document.getElementById('slate-lead-status');
    var data={slug:'${slug}',name:g('name'),email:g('email'),phone:g('phone'),projectType:g('planning'),eventDateTime:g('eventDateTime'),message:g('message'),company:g('company')};
    fetch('${CAPTURE_ENDPOINT}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json();})
      .then(function(){f.style.display='none';s.textContent="Thanks! We got it and we'll be in touch soon.";})
      .catch(function(){s.textContent='Sorry, something went wrong. Please email us directly.';});
  });
})();
</script>`;
}

export default function LeadFormEmbedCard({ slug }: { slug: string | null | undefined }) {
  const [copied, setCopied] = useState(false);

  if (!slug) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <Code2 className="w-4 h-4 text-primary" />
            Website Lead Form
          </CardTitle>
          <p className="text-xs text-muted-foreground">Your account needs a slug before you can embed a form. Contact support.</p>
        </CardHeader>
      </Card>
    );
  }

  const snippet = buildSnippet(slug);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Embed code copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the code and copy manually");
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <Code2 className="w-4 h-4 text-primary" />
          Website Lead Form
        </CardTitle>
        <p className="text-xs text-muted-foreground">Paste this into your website (Pixieset, HoneyBook, Squarespace, etc.) and inquiries land straight in your pipeline.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={copy} size="sm" className="gap-2">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy embed code"}
        </Button>
        <textarea
          readOnly
          value={snippet}
          onFocus={e => e.currentTarget.select()}
          className="w-full h-40 bg-secondary border border-border rounded-lg p-3 font-mono text-xs text-muted-foreground resize-y"
          spellCheck={false}
        />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How to use it</p>
          <p>1. Copy the code above. 2. In your website editor, add an "Embed" or "Custom HTML" block. 3. Paste and save.</p>
          <p>Every submission shows up under <b>Inquiry</b> in your pipeline, and your auto-reply settings apply.</p>
        </div>
      </CardContent>
    </Card>
  );
}
