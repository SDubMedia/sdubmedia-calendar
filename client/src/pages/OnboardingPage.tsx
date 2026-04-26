// ============================================================
// OnboardingPage — Role-specific welcome walkthrough
// Shown once after first password change
// ============================================================

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { UserRole } from "@/lib/types";
import {
  LayoutDashboard, CalendarDays, FileText, Clapperboard,
  Clock, DollarSign, HeartPulse,
  ChevronRight, ChevronLeft, CheckCircle,
  Building2, Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingStep {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  detail: string;
}

const PARTNER_STEPS: OnboardingStep[] = [
  {
    icon: LayoutDashboard, iconColor: "text-cyan-400", iconBg: "bg-cyan-500/20",
    title: "Your Dashboard",
    description: "Business overview at a glance",
    detail: "See revenue metrics, upcoming shoots, recent invoices, and a 6-month revenue chart — all filtered to your clients.",
  },
  {
    icon: CalendarDays, iconColor: "text-blue-400", iconBg: "bg-blue-500/20",
    title: "Production Calendar",
    description: "Track all scheduled shoots",
    detail: "View upcoming projects across your clients with crew assignments, locations, and times. Click any project for full details.",
  },
  {
    icon: Clapperboard, iconColor: "text-purple-400", iconBg: "bg-purple-500/20",
    title: "Content Series",
    description: "Collaborate on content strategy",
    detail: "Plan multi-episode video series with AI-powered brainstorming. Work with clients and Claude to develop concepts, talking points, and production plans.",
  },
  {
    icon: FileText, iconColor: "text-green-400", iconBg: "bg-green-500/20",
    title: "Billing & Invoices",
    description: "Track revenue and send invoices",
    detail: "View monthly billing summaries, generate professional PDF invoices, and email them directly to clients. Track payment status in real-time.",
  },
  {
    icon: HeartPulse, iconColor: "text-red-400", iconBg: "bg-red-500/20",
    title: "Client Health",
    description: "Monitor client profitability",
    detail: "See per-client revenue, margins, trends, and outstanding invoices. Identify your most profitable relationships and spot issues early.",
  },
];

const CLIENT_STEPS: OnboardingStep[] = [
  {
    icon: LayoutDashboard, iconColor: "text-cyan-400", iconBg: "bg-cyan-500/20",
    title: "Your Dashboard",
    description: "Everything in one place",
    detail: "See your upcoming shoots, projects in progress, completed deliverables, and invoices — all from your personalized dashboard.",
  },
  {
    icon: CalendarDays, iconColor: "text-blue-400", iconBg: "bg-blue-500/20",
    title: "Project Calendar",
    description: "Your production schedule",
    detail: "View all your scheduled shoots with dates, times, and locations. See which projects are upcoming, being filmed, or in editing.",
  },
  {
    icon: Clapperboard, iconColor: "text-purple-400", iconBg: "bg-purple-500/20",
    title: "Content Series",
    description: "Collaborate on your content strategy",
    detail: "Work directly with the SDub Media team and AI to plan video series for your brand. Brainstorm episode ideas, review concepts, and track production progress — all in one workspace.",
  },
  {
    icon: FileText, iconColor: "text-green-400", iconBg: "bg-green-500/20",
    title: "Invoices & Deliverables",
    description: "Access your invoices and final content",
    detail: "View your invoices and payment status. When projects are completed, access your deliverables directly through the app via Google Drive links.",
  },
];

const STAFF_STEPS: OnboardingStep[] = [
  {
    icon: LayoutDashboard, iconColor: "text-cyan-400", iconBg: "bg-cyan-500/20",
    title: "Your Dashboard",
    description: "Your day at a glance",
    detail: "See your next shoot, how many projects you have this month, hours worked, and estimated earnings — all on your personalized dashboard.",
  },
  {
    icon: CalendarDays, iconColor: "text-blue-400", iconBg: "bg-blue-500/20",
    title: "My Schedule",
    description: "Your upcoming assignments",
    detail: "View all your assigned shoots in a schedule or calendar view. See dates, times, locations, and your role on each project.",
  },
  {
    icon: Clock, iconColor: "text-cyan-400", iconBg: "bg-cyan-500/20",
    title: "Hours & Roles",
    description: "Track your work across projects",
    detail: "Each project shows your assigned role (Videographer, Editor, Photographer, etc.) and hours worked. See exactly what you're booked for.",
  },
  {
    icon: DollarSign, iconColor: "text-green-400", iconBg: "bg-green-500/20",
    title: "Earnings",
    description: "Your pay breakdown",
    detail: "View your monthly earnings with a per-project breakdown. See hours worked, pay rates, and totals for the current month.",
  },
  {
    icon: Building2, iconColor: "text-purple-400", iconBg: "bg-purple-500/20",
    title: "Set Up Your Business Info",
    description: "Add your name and address for invoices",
    detail: "Go to My Invoices and tap 'Business Info' to enter your business name (or personal name) and address. This appears on every invoice you generate.",
  },
  {
    icon: Receipt, iconColor: "text-amber-400", iconBg: "bg-amber-500/20",
    title: "Generate Invoices",
    description: "Create and download professional invoices",
    detail: "From My Invoices, select a date range and who to invoice (SDub Media or a partner). The system pulls your completed projects and generates a PDF you can download, print, and send.",
  },
];

function getStepsForRole(role: UserRole): OnboardingStep[] {
  switch (role) {
    case "partner": return PARTNER_STEPS;
    case "client": return CLIENT_STEPS;
    case "staff": return STAFF_STEPS;
    default: return CLIENT_STEPS;
  }
}

function getRoleWelcome(role: UserRole, name: string): { title: string; subtitle: string } {
  const firstName = name.split(" ")[0] || "there";
  switch (role) {
    case "partner":
      return {
        title: `Welcome to Slate, ${firstName}!`,
        subtitle: "Your partner dashboard for managing clients, billing, and content strategy.",
      };
    case "client":
      return {
        title: `Welcome, ${firstName}!`,
        subtitle: "SDub Media built this platform to keep you connected to every project we're working on together.",
      };
    case "staff":
      return {
        title: `Hey ${firstName}, welcome to the team!`,
        subtitle: "This is where you'll find your schedule, assignments, earnings, and invoicing.",
      };
    default:
      return { title: `Welcome, ${firstName}!`, subtitle: "Let's show you around." };
  }
}

import OwnerOnboardingWizard from "@/components/OwnerOnboardingWizard";
import StaffOnboardingWelcome from "@/components/StaffOnboardingWelcome";

export default function OnboardingPage() {
  const { profile, completeOnboarding, signOut } = useAuth();
  const [step, setStep] = useState(-1); // -1 = welcome screen, 0+ = steps
  const [completing, setCompleting] = useState(false);

  const role = profile?.role ?? "client";
  const name = profile?.name ?? "";

  // Owner gets the setup wizard
  if (role === "owner") return <OwnerOnboardingWizard />;
  // Staff gets the welcome + address screen
  if (role === "staff") return <StaffOnboardingWelcome />;

  const steps = getStepsForRole(role);
  const welcome = getRoleWelcome(role, name);

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await completeOnboarding();
    } catch (err: any) {
      toast.error(err?.message || "Couldn't finish setup. Try signing out and back in.");
      setCompleting(false);
    }
  };

  const isWelcome = step === -1;
  const isLastStep = step === steps.length - 1;
  const currentStep = !isWelcome ? steps[step] : null;

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        {!isWelcome && (
          <div className="flex justify-center gap-1.5 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-secondary"
                )}
              />
            ))}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-8 text-center">
          {isWelcome ? (
            /* Welcome Screen */
            <>
              <img src="/pwa-192x192.png" alt="Slate" className="w-16 h-16 rounded-2xl mx-auto mb-6" />
              <h1 className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {welcome.title}
              </h1>
              <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                {welcome.subtitle}
              </p>
              <p className="text-sm text-muted-foreground/60 mb-6">
                Let's take a quick tour of what's available to you.
              </p>
              <button
                onClick={() => setStep(0)}
                className="px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center gap-2 mx-auto"
              >
                Show Me Around <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : currentStep ? (
            /* Step Screen */
            <>
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6", currentStep.iconBg)}>
                <currentStep.icon className={cn("w-8 h-8", currentStep.iconColor)} />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {currentStep.title}
              </h2>
              <p className="text-primary text-sm font-medium mb-4">{currentStep.description}</p>
              <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto leading-relaxed">
                {currentStep.detail}
              </p>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>

                {isLastStep ? (
                  <button
                    onClick={handleComplete}
                    disabled={completing}
                    className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {completing ? "Getting Started..." : "Get Started"}
                  </button>
                ) : (
                  <button
                    onClick={() => setStep(s => s + 1)}
                    className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center gap-2"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          ) : null}

          {/* Skip option */}
          {!isLastStep && (
            <button
              onClick={handleComplete}
              disabled={completing}
              className="mt-6 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Skip tour
            </button>
          )}
          <div className="mt-4">
            <button
              onClick={() => signOut()}
              className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
            >
              Use a different account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
