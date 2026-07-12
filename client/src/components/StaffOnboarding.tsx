// ============================================================
// StaffOnboarding — required, blocking first-run flow for a new staff member.
// They can't use the app until they (1) confirm their info, (2) sign the 1099
// independent-contractor agreement (owner countersigns later), and (3) fill +
// sign the official IRS W-9. Owner preview (impersonation) bypasses this gate
// in App.tsx. Completion is stamped server-side by /api/w9-submit; the final
// step calls completeStaffOnboarding() so the gate clears without a reload.
// ============================================================

import { useState } from "react";
import { Briefcase, Check, FileSignature, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthToken } from "@/lib/supabase";
import { formatPhoneInput } from "@/lib/utils";
import { toast } from "sonner";
import SignaturePad, { type CapturedSignature } from "@/components/SignaturePad";
import {
  STAFF_AGREEMENT_VERSION, STAFF_AGREEMENT_TITLE, defaultAgreementText,
} from "@/lib/staffAgreement";
import type { UserProfile } from "@/lib/types";

const TAX_CLASSES = [
  "Individual / sole proprietor",
  "C corporation",
  "S corporation",
  "Partnership",
  "Trust / estate",
  "Limited liability company (LLC)",
  "Other",
];

async function post(path: string, body: unknown) {
  const token = await getAuthToken();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: "Failed" }));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json;
}

export default function StaffOnboarding({ profile }: { profile: UserProfile }) {
  const { data, refresh } = useApp();
  const { signOut, completeStaffOnboarding } = useAuth();

  const me = data.crewMembers.find(c => c.id === profile.crewMemberId);
  // Effective agreement — the org's edited text/version, or the built-in default.
  const agreementText = (data.organization?.staffAgreementText || "").trim() || defaultAgreementText(data.organization?.name || "");
  const agreementVersion = (data.organization?.staffAgreementVersion || "").trim() || STAFF_AGREEMENT_VERSION;
  const agreement = data.staffAgreements.find(
    a => a.crewMemberId === profile.crewMemberId && a.agreementVersion === agreementVersion,
  );

  const infoDone = !!(me?.name?.trim() && me?.email?.trim() && me?.phone?.trim());
  const agreementDone = !!agreement?.staffSignedAt;

  // Step 1 — info
  const [name, setName] = useState(me?.name ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [businessName, setBusinessName] = useState(me?.businessName ?? "");
  const [businessAddress, setBusinessAddress] = useState(me?.businessAddress ?? "");
  const [businessCity, setBusinessCity] = useState(me?.businessCity ?? "");
  const [businessState, setBusinessState] = useState(me?.businessState ?? "");
  const [businessZip, setBusinessZip] = useState(me?.businessZip ?? "");
  const [savingInfo, setSavingInfo] = useState(false);

  // Step 3 — W-9
  const [w9Name, setW9Name] = useState(me?.name ?? "");
  const [w9Business, setW9Business] = useState(me?.businessName ?? "");
  const [w9Class, setW9Class] = useState(TAX_CLASSES[0]);
  const [w9Address, setW9Address] = useState("");
  const [w9City, setW9City] = useState("");
  const [w9State, setW9State] = useState("");
  const [w9Zip, setW9Zip] = useState("");
  const [w9IdType, setW9IdType] = useState<"ssn" | "ein">("ssn");
  const [w9TaxId, setW9TaxId] = useState("");

  const saveInfo = async () => {
    if (!name.trim() || !email.trim() || !phone.trim()) { toast.error("Add your name, email, and phone"); return; }
    setSavingInfo(true);
    try {
      await post("/api/staff-update-profile", {
        name, email, phone, businessName, businessAddress, businessCity, businessState, businessZip,
      });
      await refresh();
      toast.success("Info saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your info");
    } finally {
      setSavingInfo(false);
    }
  };

  const sign1099 = async (sig: CapturedSignature) => {
    await post("/api/staff-sign-agreement", {
      agreementVersion,
      agreementTitle: STAFF_AGREEMENT_TITLE,
      signature: { ...sig, email },
    });
    await refresh();
    toast.success("1099 agreement signed");
  };

  // The IRS W-9 line 6 is a single "City, state, and ZIP code" field — recombine
  // the split inputs for the PDF fill.
  const w9CityStateZip = [[w9City.trim(), w9State.trim()].filter(Boolean).join(", "), w9Zip.trim()].filter(Boolean).join(" ");
  const w9Complete = !!(w9Name.trim() && w9Address.trim() && w9City.trim() && w9State.trim() && w9Zip.trim() && w9TaxId.trim());

  const submitW9 = async (sig: CapturedSignature) => {
    const resp = await post("/api/w9-submit", {
      fields: {
        name: w9Name,
        businessName: w9Business,
        taxClassification: w9Class,
        address: w9Address,
        cityStateZip: w9CityStateZip,
        ssn: w9IdType === "ssn" ? w9TaxId : "",
        ein: w9IdType === "ein" ? w9TaxId : "",
      },
      signature: sig,
    });
    completeStaffOnboarding(resp.completedAt || new Date().toISOString());
    toast.success("W-9 submitted — you're all set!");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-3">
            <Briefcase className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Welcome aboard — let's get you set up
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            A few things before you start. This only happens once.
          </p>
        </div>

        {/* Step 1 — info */}
        <div className="bg-card border border-border rounded-xl p-4 mb-3 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${infoDone ? "bg-green-500/20 text-green-400" : "bg-primary/15 text-primary"}`}>
              {infoDone ? <Check className="w-3.5 h-3.5" /> : "1"}
            </div>
            <span className="text-sm font-medium text-foreground">Your info</span>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} inputMode="tel" placeholder="615-000-0000" className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Business name (optional)</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Business address (optional)</Label>
              <Input value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} placeholder="Street" className="bg-secondary border-border mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input value={businessCity} onChange={(e) => setBusinessCity(e.target.value)} placeholder="City" className="bg-secondary border-border min-w-0" />
              <Input value={businessState} onChange={(e) => setBusinessState(e.target.value)} placeholder="State" className="bg-secondary border-border min-w-0" />
              <Input value={businessZip} onChange={(e) => setBusinessZip(e.target.value)} placeholder="ZIP" className="bg-secondary border-border min-w-0" />
            </div>
            <Button onClick={saveInfo} disabled={savingInfo} className="w-full">
              {savingInfo ? "Saving…" : infoDone ? "Update & continue" : "Save & continue"}
            </Button>
          </div>
        </div>

        {/* Step 2 — sign 1099 */}
        <div className={`bg-card border border-border rounded-xl p-4 mb-3 overflow-hidden ${!infoDone ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${agreementDone ? "bg-green-500/20 text-green-400" : "bg-primary/15 text-primary"}`}>
              {agreementDone ? <Check className="w-3.5 h-3.5" /> : "2"}
            </div>
            <span className="text-sm font-medium text-foreground flex items-center gap-1.5"><FileSignature className="w-3.5 h-3.5" /> {STAFF_AGREEMENT_TITLE}</span>
          </div>
          {agreementDone ? (
            <p className="text-xs text-muted-foreground pl-8">Signed{agreement?.ownerSignedAt ? " · countersigned by SDub Media" : " · awaiting countersignature"}.</p>
          ) : (
            <div className="space-y-3">
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{agreementText}</p>
              </div>
              <SignaturePad
                defaultName={name || me?.name || ""}
                buttonLabel="Sign agreement"
                consentText="By signing, you agree this is your legal signature and you accept the 1099 agreement terms."
                onSign={sign1099}
              />
            </div>
          )}
        </div>

        {/* Step 3 — W-9 */}
        <div className={`bg-card border border-border rounded-xl p-4 overflow-hidden ${!agreementDone ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs bg-primary/15 text-primary">3</div>
            <span className="text-sm font-medium text-foreground flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> IRS Form W-9</span>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Name (as shown on your tax return)</Label>
              <Input value={w9Name} onChange={(e) => setW9Name(e.target.value)} autoComplete="name" className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Business name / disregarded entity (if different)</Label>
              <Input value={w9Business} onChange={(e) => setW9Business(e.target.value)} className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Federal tax classification</Label>
              <select value={w9Class} onChange={(e) => setW9Class(e.target.value)} className="w-full mt-1 h-10 rounded-md border border-border bg-secondary px-2 text-sm text-foreground">
                {TAX_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Address (number, street, apt.)</Label>
              <Input value={w9Address} onChange={(e) => setW9Address(e.target.value)} autoComplete="address-line1" className="bg-secondary border-border mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">City</Label>
                <Input value={w9City} onChange={(e) => setW9City(e.target.value)} autoComplete="address-level2" className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">State</Label>
                <Input value={w9State} onChange={(e) => setW9State(e.target.value)} autoComplete="address-level1" className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">ZIP</Label>
                <Input value={w9Zip} onChange={(e) => setW9Zip(e.target.value)} autoComplete="postal-code" inputMode="numeric" className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Taxpayer ID</Label>
              <div className="flex gap-2 mt-1">
                <select value={w9IdType} onChange={(e) => setW9IdType(e.target.value as "ssn" | "ein")} className="h-10 rounded-md border border-border bg-secondary px-2 text-sm text-foreground shrink-0">
                  <option value="ssn">SSN</option>
                  <option value="ein">EIN</option>
                </select>
                <Input value={w9TaxId} onChange={(e) => setW9TaxId(e.target.value)} inputMode="numeric" placeholder={w9IdType === "ssn" ? "123-45-6789" : "12-3456789"} className="bg-secondary border-border min-w-0" />
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-secondary/40 border border-border p-3">
              <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">Your W-9 is private — only SDub Media can view it, and your SSN is stored encrypted.</p>
            </div>
            <SignaturePad
              defaultName={w9Name || me?.name || ""}
              buttonLabel="Sign & submit W-9"
              disabled={!w9Complete}
              disabledHint="Fill in every field above to sign."
              consentText="Under penalties of perjury, I certify the information on this W-9 is true, correct, and complete. I agree to sign this W-9 electronically, and that my electronic signature is the legal equivalent of my handwritten signature."
              onSign={submitW9}
            />
          </div>
        </div>

        <button onClick={signOut} className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-4">Sign out</button>
      </div>
    </div>
  );
}
