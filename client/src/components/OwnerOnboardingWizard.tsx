// ============================================================
// OwnerOnboardingWizard — Question-based setup for new owners
// Configures org features and defaults based on answers
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { OrgFeatures, ProductionType, BillingModel } from "@/lib/types";
import { DEFAULT_FEATURES } from "@/lib/types";
import { Film, ChevronRight, ChevronLeft, CheckCircle, Users, User, Camera, Video, DollarSign, Clock, FileText, Handshake, Car, Receipt, Clapperboard, Monitor } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Step = "welcome" | "company" | "type" | "team" | "billing" | "partner" | "features" | "done";

const STEPS: Step[] = ["welcome", "company", "type", "team", "billing", "partner", "features", "done"];

interface FeatureOption {
  key: keyof OrgFeatures;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const FEATURE_OPTIONS: FeatureOption[] = [
  { key: "calendar", label: "Production Calendar", description: "Schedule shoots and track project status", icon: Film },
  { key: "invoicing", label: "Invoicing", description: "Create and send professional invoices", icon: FileText },
  { key: "mileage", label: "Mileage Tracking", description: "Track business miles for tax deductions", icon: Car },
  { key: "expenses", label: "Expense Tracking", description: "Import credit card statements, categorize for CPA", icon: Receipt },
  { key: "contentSeries", label: "Content Series", description: "Plan multi-episode video series", icon: Clapperboard },
  { key: "clientPortal", label: "Client Portal", description: "Give clients access to view their projects", icon: Monitor },
];

export default function OwnerOnboardingWizard() {
  const { updateOrganization, addCrewMember } = useApp();
  const { profile, completeOnboarding } = useAuth();
  const firstName = (profile?.name || "").split(" ")[0] || "there";

  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [companyName, setCompanyName] = useState("");
  const [productionType, setProductionType] = useState<ProductionType>("both");
  const [hasTeam, setHasTeam] = useState<boolean | null>(null);
  const [billingModel, setBillingModel] = useState<BillingModel>("hourly");
  const [billingRate, setBillingRate] = useState(200);
  const [hasPartner, setHasPartner] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [features, setFeatures] = useState<OrgFeatures>({ ...DEFAULT_FEATURES });
  const [completing, setCompleting] = useState(false);

  const stepIndex = STEPS.indexOf(currentStep);
  const progress = Math.round(((stepIndex) / (STEPS.length - 1)) * 100);

  function next() {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) setCurrentStep(STEPS[idx + 1]);
  }
  function back() {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) setCurrentStep(STEPS[idx - 1]);
  }

  function handleTeamChoice(team: boolean) {
    setHasTeam(team);
    setFeatures(f => ({ ...f, crewManagement: team }));
    next();
  }

  function handlePartnerChoice(partner: boolean) {
    setHasPartner(partner);
    setFeatures(f => ({ ...f, partnerSplits: partner }));
    next();
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      await updateOrganization({
        name: companyName || "My Company",
        features,
        productionType,
        defaultBillingModel: billingModel,
        defaultBillingRate: billingRate,
      });

      // Create the owner as a crew member
      if (profile?.name) {
        try {
          await addCrewMember({
            name: profile.name,
            roleRates: [],
            phone: "",
            email: profile.email || "",
            defaultPayRatePerHour: 0,
          });
        } catch { /* might already exist */ }
      }

      await completeOnboarding();
    } catch {
      setCompleting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Progress bar */}
        {currentStep !== "welcome" && currentStep !== "done" && (
          <div className="mb-6">
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-8">
          {/* Welcome */}
          {currentStep === "welcome" && (
            <div className="text-center">
              <img src="/pwa-192x192.png" alt="Slate" className="w-16 h-16 rounded-2xl mx-auto mb-6" />
              <h1 className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Welcome to Slate, {firstName}!
              </h1>
              <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                Let's set up your production management platform. A few quick questions and you'll be ready to go.
              </p>
              <button onClick={next} className="px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center gap-2 mx-auto">
                Let's Go <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Company Name */}
          {currentStep === "company" && (
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                What's your company name?
              </h2>
              <p className="text-muted-foreground text-sm mb-6">This will appear on invoices and reports.</p>
              <Input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="e.g. SDub Media"
                className="bg-secondary border-border text-center text-lg h-12 mb-6"
                autoFocus
              />
              <div className="flex justify-between">
                <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /> Back</button>
                <button onClick={next} className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium flex items-center gap-2">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Production Type */}
          {currentStep === "type" && (
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                What type of production?
              </h2>
              <p className="text-muted-foreground text-sm mb-6">We'll tailor roles and settings for your work.</p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {([
                  { value: "video" as ProductionType, label: "Video", icon: Video },
                  { value: "photo" as ProductionType, label: "Photo", icon: Camera },
                  { value: "both" as ProductionType, label: "Both", icon: Film },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setProductionType(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                      productionType === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    <opt.icon className="w-6 h-6" />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-between">
                <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /> Back</button>
                <button onClick={next} className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium flex items-center gap-2">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Team */}
          {currentStep === "team" && (
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Do you work with a team?
              </h2>
              <p className="text-muted-foreground text-sm mb-6">We'll set up crew management if you have staff.</p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <button
                  onClick={() => handleTeamChoice(false)}
                  className={cn("flex flex-col items-center gap-3 p-6 rounded-lg border transition-colors",
                    hasTeam === false ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                  )}
                >
                  <User className="w-8 h-8 text-primary" />
                  <span className="text-sm font-medium text-foreground">Just Me</span>
                  <span className="text-xs text-muted-foreground">Solo operation</span>
                </button>
                <button
                  onClick={() => handleTeamChoice(true)}
                  className={cn("flex flex-col items-center gap-3 p-6 rounded-lg border transition-colors",
                    hasTeam === true ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                  )}
                >
                  <Users className="w-8 h-8 text-primary" />
                  <span className="text-sm font-medium text-foreground">I Have a Team</span>
                  <span className="text-xs text-muted-foreground">Crew & contractors</span>
                </button>
              </div>
              <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto"><ChevronLeft className="w-4 h-4" /> Back</button>
            </div>
          )}

          {/* Billing */}
          {currentStep === "billing" && (
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                How do you bill clients?
              </h2>
              <p className="text-muted-foreground text-sm mb-6">You can always change this per client later.</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <button
                  onClick={() => setBillingModel("hourly")}
                  className={cn("flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                    billingModel === "hourly" ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                  )}
                >
                  <Clock className="w-6 h-6 text-primary" />
                  <span className="text-sm font-medium text-foreground">Hourly</span>
                </button>
                <button
                  onClick={() => setBillingModel("per_project")}
                  className={cn("flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                    billingModel === "per_project" ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                  )}
                >
                  <DollarSign className="w-6 h-6 text-primary" />
                  <span className="text-sm font-medium text-foreground">Per Project</span>
                </button>
              </div>
              <div className="mb-6">
                <label className="text-xs text-muted-foreground block mb-1">
                  {billingModel === "hourly" ? "Default rate per hour ($)" : "Default rate per project ($)"}
                </label>
                <Input
                  type="number"
                  value={billingRate || ""}
                  onChange={e => setBillingRate(parseFloat(e.target.value) || 0)}
                  className="bg-secondary border-border text-center h-10 w-32 mx-auto"
                  placeholder="200"
                />
              </div>
              <div className="flex justify-between">
                <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /> Back</button>
                <button onClick={next} className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium flex items-center gap-2">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Partner */}
          {currentStep === "partner" && (
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Do you split revenue with a partner?
              </h2>
              <p className="text-muted-foreground text-sm mb-6">If you share profits with a business partner on any clients.</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <button
                  onClick={() => handlePartnerChoice(false)}
                  className={cn("flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                    !hasPartner ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                  )}
                >
                  <span className="text-2xl">🙅</span>
                  <span className="text-sm font-medium text-foreground">No Partner</span>
                  <span className="text-xs text-muted-foreground">All mine</span>
                </button>
                <button
                  onClick={() => { setHasPartner(true); setFeatures(f => ({ ...f, partnerSplits: true })); }}
                  className={cn("flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                    hasPartner ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                  )}
                >
                  <Handshake className="w-6 h-6 text-primary" />
                  <span className="text-sm font-medium text-foreground">Yes</span>
                  <span className="text-xs text-muted-foreground">Revenue sharing</span>
                </button>
              </div>
              {hasPartner && (
                <div className="mb-4">
                  <Input
                    value={partnerName}
                    onChange={e => setPartnerName(e.target.value)}
                    placeholder="Partner's name or company"
                    className="bg-secondary border-border text-center"
                    autoFocus
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">You can configure split percentages per client later.</p>
                </div>
              )}
              {hasPartner && (
                <div className="flex justify-between">
                  <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /> Back</button>
                  <button onClick={next} className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium flex items-center gap-2">
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              {!hasPartner && (
                <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto"><ChevronLeft className="w-4 h-4" /> Back</button>
              )}
            </div>
          )}

          {/* Features */}
          {currentStep === "features" && (
            <div>
              <h2 className="text-xl font-bold text-foreground mb-2 text-center" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                What do you need?
              </h2>
              <p className="text-muted-foreground text-sm mb-6 text-center">Toggle on what's useful. You can change these anytime in settings.</p>
              <div className="space-y-2 mb-6">
                {FEATURE_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setFeatures(f => ({ ...f, [opt.key]: !f[opt.key] }))}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left",
                      features[opt.key] ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/20"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      features[opt.key] ? "bg-primary/20" : "bg-secondary"
                    )}>
                      <opt.icon className={cn("w-4 h-4", features[opt.key] ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium", features[opt.key] ? "text-foreground" : "text-muted-foreground")}>{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                    <div className={cn(
                      "w-10 h-5 rounded-full transition-colors shrink-0",
                      features[opt.key] ? "bg-primary" : "bg-secondary border border-border"
                    )}>
                      <span className={cn(
                        "block w-4 h-4 rounded-full bg-white transition-transform mt-0.5",
                        features[opt.key] ? "translate-x-5" : "translate-x-0.5"
                      )} />
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-between">
                <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /> Back</button>
                <button onClick={next} className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium flex items-center gap-2">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Done */}
          {currentStep === "done" && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                You're all set!
              </h2>
              <p className="text-muted-foreground mb-2">
                <strong>{companyName || "Your company"}</strong> is ready to go.
              </p>
              <p className="text-sm text-muted-foreground mb-8">
                Next steps: add your first client, set up locations, and start scheduling projects.
              </p>
              <button
                onClick={handleComplete}
                disabled={completing}
                className="px-8 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center gap-2 mx-auto disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {completing ? "Setting up..." : "Go to Dashboard"}
              </button>
              <button onClick={back} className="mt-4 text-xs text-muted-foreground hover:text-foreground mx-auto block">
                Go back and change something
              </button>
            </div>
          )}

          {/* Skip */}
          {currentStep !== "welcome" && currentStep !== "done" && (
            <button
              onClick={handleComplete}
              disabled={completing}
              className="mt-6 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors block mx-auto"
            >
              Skip setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
