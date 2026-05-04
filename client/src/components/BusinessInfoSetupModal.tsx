// ============================================================
// BusinessInfoSetupModal — one-time form that collects the
// business identity Slate needs before contracts and invoices
// look professional. Fires once after the owner finishes the
// onboarding wizard.
//
// Three screens:
//   1. Identity form (name, email, logo, phone, address)
//   2. Stripe question — do you want to collect payments here?
//   3. Help-button hint
//
// Required fields: business name + email. Everything else
// is optional. "Skip for now" exits the modal without saving
// (still marks seen) for users who want to defer.
//
// `businessInfoSetupSeen` flips at the end of save mutation
// (NOT at the help-hint screen) so a refresh mid-flow doesn't
// re-trigger the modal.
// ============================================================

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, HelpCircle, ImageIcon, X, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Permissive email pattern — catches obvious garbage but doesn't
// try to fully implement RFC 5322. A typo'd email will fail when
// Slate actually sends, which surfaces a clearer error than over-
// strict validation that rejects unusual but valid addresses.
const EMAIL_RE = /.+@.+\..+/;

function readImageAsDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Must be an image"));
    if (file.size > maxBytes) return reject(new Error(`Too large (max ${Math.round(maxBytes / 1024)}KB)`));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Failed to read file"));
    r.readAsDataURL(file);
  });
}

type Screen = "form" | "stripe" | "help";

export default function BusinessInfoSetupModal() {
  const { data, updateOrganization } = useApp();
  const { profile, markBusinessInfoSetupSeen } = useAuth();
  const [, setLocation] = useLocation();
  const org = data.organization;

  const shouldOpen =
    profile?.role === "owner"
    && profile?.hasCompletedOnboarding
    && profile?.guidance?.businessInfoSetupSeen === false
    && !!org;

  // Latch open once on first render where the condition is true.
  // After the user saves we mark `businessInfoSetupSeen=true` so a
  // refresh mid-flow doesn't re-open this modal — but the local
  // `opened` flag keeps the current session's modal mounted through
  // the Stripe + help screens until the user explicitly dismisses.
  const [opened, setOpened] = useState(false);
  const [screen, setScreen] = useState<Screen>("form");

  useEffect(() => {
    if (shouldOpen && !opened) setOpened(true);
  }, [shouldOpen, opened]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Pre-fill from org data once it's loaded. The modal can mount
  // before AppContext finishes its initial fetch — initializing
  // useState directly from `org?.foo` would lock empty strings in
  // and never update once the context arrives. Track a `hydrated`
  // flag so we only seed once (otherwise live realtime updates to
  // org would clobber the user's in-progress edits).
  useEffect(() => {
    if (!org || hydrated) return;
    setName(org.name || "");
    setEmail(org.businessInfo?.email || "");
    setPhone(org.businessInfo?.phone || "");
    setAddress(org.businessInfo?.address || "");
    setCity(org.businessInfo?.city || "");
    setState(org.businessInfo?.state || "");
    setZip(org.businessInfo?.zip || "");
    setLogoUrl(org.logoUrl || "");
    setHydrated(true);
  }, [org, hydrated]);

  if (!opened) return null;

  function usePersonalName() {
    if (profile?.name) setName(profile.name);
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    setLogoErr(null);
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const url = await readImageAsDataUrl(f, 250 * 1024);
      setLogoUrl(url);
    } catch (err) {
      setLogoErr(err instanceof Error ? err.message : "Failed to load image");
    }
  }

  async function handleSave() {
    setEmailErr(null);
    if (!name.trim()) { toast.error("Business name required"); return; }
    if (!email.trim()) { toast.error("Business email required"); return; }
    if (!EMAIL_RE.test(email.trim())) { setEmailErr("Doesn't look like a valid email"); return; }

    setSaving(true);
    try {
      await updateOrganization({
        name: name.trim(),
        logoUrl,
        businessInfo: {
          ...(org!.businessInfo || {}),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim(),
          phone: phone.trim(),
          email: email.trim(),
          website: org?.businessInfo?.website || "",
          ein: org?.businessInfo?.ein || "",
        },
      });
      // Mark seen at save time — refresh-mid-flow shouldn't re-fire
      // the modal even if the user closes the tab before clicking
      // through the rest of the screens.
      await markBusinessInfoSetupSeen();
      setScreen("stripe");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function skipForNow() {
    // No-op save. Still marks seen so the modal doesn't re-fire.
    // User can fill in business info later via Settings.
    await markBusinessInfoSetupSeen();
    setOpened(false);
  }

  async function handleStripeYes() {
    // Already marked seen at save time. Send them to Settings to
    // run the Connect flow — most direct path. Close the modal
    // first so they don't return to it after Stripe Connect.
    setOpened(false);
    setLocation("/settings");
  }

  async function handleStripeNo() {
    // Persist opt-out so the prereq blocker on contracts with
    // payment milestones can offer different copy ("you opted
    // out of Stripe — re-enable in Settings if you want").
    await markBusinessInfoSetupSeen({ stripeOptedOut: true });
    setScreen("help");
  }

  function dismissHelp() {
    setOpened(false);
  }

  return (
    <Dialog open onOpenChange={() => { /* not dismissable until save or skip */ }}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto" showCloseButton={false}>
        {screen === "form" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                <Building2 className="w-5 h-5 text-primary" />
                Tell us about your business
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This is what shows up on the contracts, invoices, and emails your clients receive. You can change any of this later in Settings.
            </p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Business name <span className="text-destructive">*</span></label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Production Co."
                  className="bg-secondary border-border"
                />
                {profile?.name && profile.name !== name && (
                  <button
                    type="button"
                    onClick={usePersonalName}
                    className="text-xs text-primary hover:underline"
                  >
                    Don't have a business name? Use my personal name ({profile.name})
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Business email <span className="text-destructive">*</span></label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailErr(null); }}
                  placeholder="you@yourcompany.com"
                  className={cn("bg-secondary border-border", emailErr && "border-destructive")}
                />
                {emailErr ? (
                  <p className="text-[11px] text-destructive">{emailErr}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Where client replies go. Slate sends from a Slate domain — your business email becomes the Reply-To.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Logo <span className="text-muted-foreground font-normal">(optional)</span></label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg border border-border bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo preview" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary border border-border text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors cursor-pointer">
                      <input type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
                      {logoUrl ? "Replace logo" : "Upload logo"}
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => { setLogoUrl(""); setLogoErr(null); }}
                        className="ml-2 text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Remove
                      </button>
                    )}
                    {logoErr && <p className="text-[11px] text-destructive">{logoErr}</p>}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Phone <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="bg-secondary border-border"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Address <span className="text-muted-foreground font-normal">(optional — used for mileage calculations and prints on invoices)</span></label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St"
                  className="bg-secondary border-border"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="bg-secondary border-border" />
                  <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className="bg-secondary border-border" />
                  <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP" className="bg-secondary border-border" />
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:items-center">
              <button
                type="button"
                onClick={() => { void skipForNow(); }}
                className="text-xs text-muted-foreground hover:text-foreground sm:order-1"
              >
                Skip for now
              </button>
              <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto sm:order-2">
                {saving ? "Saving..." : "Save and continue"}
              </Button>
            </DialogFooter>
          </>
        )}

        {screen === "stripe" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                <CreditCard className="w-5 h-5 text-primary" />
                Want to get paid through Slate?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Slate can collect deposits when clients sign contracts and accept invoice payments online — through your own Stripe account. Funds go straight to your bank, not through Slate.
            </p>
            <p className="text-sm text-muted-foreground">
              You can still send contracts and invoices without this — clients just pay you offline (check, Venmo, whatever you already use).
            </p>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => { void handleStripeNo(); }} className="w-full sm:w-auto">
                Not right now
              </Button>
              <Button onClick={() => { void handleStripeYes(); }} className="w-full sm:w-auto">
                Yes, set up Stripe
              </Button>
            </DialogFooter>
          </>
        )}

        {screen === "help" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                <HelpCircle className="w-5 h-5 text-primary" />
                One last thing
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed">
              On a few pages with non-obvious flows (Pipeline, Contracts, Galleries), you'll see a blue <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground"><HelpCircle className="w-3 h-3" /></span> button bottom-right. Tap it for a quick guide.
            </p>
            <p className="text-sm text-muted-foreground">
              Most pages don't have one — they're self-explanatory. We'll stay out of your way otherwise.
            </p>
            <DialogFooter>
              <Button onClick={dismissHelp} className="w-full sm:w-auto">
                Got it
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
