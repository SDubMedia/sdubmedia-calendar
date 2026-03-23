// ============================================================
// HelpPage — Role-specific guides and feature walkthroughs
// ============================================================

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/lib/types";
import {
  LayoutDashboard, CalendarDays, Clapperboard, FileText, Receipt,
  BarChart2, Users, Users2, HeartPulse, PiggyBank, MapPin, Settings,
  Shield, Search, Bell, Sun, ChevronDown, ChevronUp, HelpCircle,
  MessageSquare, CheckCircle, Download, Clock, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpSection {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  steps: string[];
}

const OWNER_HELP: HelpSection[] = [
  {
    icon: LayoutDashboard, title: "Dashboard",
    description: "Your business overview at a glance.",
    steps: ["See revenue, upcoming shoots, outstanding invoices, and gross margin", "Revenue chart shows the last 6 months", "Click 'Calendar' or 'All Invoices' to navigate"],
  },
  {
    icon: CalendarDays, title: "Calendar",
    description: "View and manage all scheduled shoots.",
    steps: ["Click any date to create a new project", "Click a project to see details, advance status, or edit", "Status flow: Upcoming → Filming Done → In Editing → Completed"],
  },
  {
    icon: Clapperboard, title: "Content Series",
    description: "Plan multi-episode video series with AI assistance.",
    steps: ["Create a new series for a client with a name and goal", "Open the workspace — chat with Claude on the left, episodes on the right", "Claude can create episodes, develop concepts, and write talking points automatically", "Fill in draft schedules on episodes (date, time, location, crew)", "Conflicts are flagged in real-time if crew or locations are double-booked", "Click 'Publish Schedule' to push all drafts to the calendar at once"],
  },
  {
    icon: Receipt, title: "Invoices",
    description: "Generate and send professional PDF invoices.",
    steps: ["Click 'Create Invoice' — select client and date range", "Line items auto-populate from completed projects", "Preview the PDF, download it, or email it directly to the client", "Track invoice status: Draft → Sent → Paid", "Already-invoiced projects won't be double-billed"],
  },
  {
    icon: HeartPulse, title: "Client Health",
    description: "Monitor profitability and trends per client.",
    steps: ["See total revenue, margin, and outstanding invoices per client", "Mini revenue charts show 6-month trends (up/down/flat)", "Identify your most profitable clients and spot issues early"],
  },
  {
    icon: Search, title: "Global Search",
    description: "Find anything instantly.",
    steps: ["Click the search bar or press Cmd+K (Ctrl+K on Windows)", "Search across projects, clients, crew, invoices, and series", "Click a result to navigate directly"],
  },
  {
    icon: Shield, title: "User Management",
    description: "Create accounts and manage roles.",
    steps: ["Create users with email/password and assign a role (Owner, Partner, Client, Staff)", "Click a user's name to edit their role, attached clients, or crew member", "Reset passwords with the option to force change on next login", "Use 'View As' at the bottom of the sidebar to preview any role"],
  },
];

const PARTNER_HELP: HelpSection[] = [
  {
    icon: LayoutDashboard, title: "Dashboard",
    description: "Business overview for your attached clients.",
    steps: ["See revenue, upcoming shoots, and invoices filtered to your clients", "All data is automatically scoped to the clients you're assigned to"],
  },
  {
    icon: CalendarDays, title: "Calendar",
    description: "View scheduled shoots for your clients.",
    steps: ["See all projects for your assigned clients", "Click any project for details"],
  },
  {
    icon: Clapperboard, title: "Content Series",
    description: "Collaborate on content strategy with clients.",
    steps: ["View and participate in series for your clients", "Chat with Claude to brainstorm ideas", "Comment on episodes and track progress"],
  },
  {
    icon: Receipt, title: "Invoices & Billing",
    description: "Track billing and send invoices for your clients.",
    steps: ["View billing summaries and create invoices", "Download or email invoices to clients"],
  },
];

const CLIENT_HELP: HelpSection[] = [
  {
    icon: LayoutDashboard, title: "Dashboard",
    description: "Your project overview.",
    steps: ["See upcoming shoots, projects in editing, and completed work", "Items needing your review appear in an amber banner at the top", "Your active content series are listed with quick links"],
  },
  {
    icon: CalendarDays, title: "Calendar",
    description: "Your production schedule.",
    steps: ["View all your scheduled shoots with dates, times, and locations", "Click any project for full details"],
  },
  {
    icon: Clapperboard, title: "Content Series",
    description: "Collaborate on your content strategy with SDub Media.",
    steps: ["Open a series workspace to see the episode plan", "Chat with the team and Claude to brainstorm ideas", "Leave comments on episodes with feedback", "When episodes are ready for review, click 'Approve' or 'Request Changes'", "Your feedback is saved and the team is notified"],
  },
  {
    icon: Download, title: "Deliverables",
    description: "Access your completed content.",
    steps: ["When a project is completed, a 'View Deliverables' link appears", "Click it to open your Google Drive folder with final files"],
  },
];

const STAFF_HELP: HelpSection[] = [
  {
    icon: LayoutDashboard, title: "Dashboard",
    description: "Your day at a glance.",
    steps: ["See your next shoot, monthly project count, hours worked, and earnings", "Upcoming assignments show your role on each shoot"],
  },
  {
    icon: CalendarDays, title: "My Schedule",
    description: "Your upcoming assignments.",
    steps: ["View all shoots you're assigned to in schedule or calendar view", "See dates, times, locations, and your role on each project", "Past projects show your hours worked and pay"],
  },
  {
    icon: DollarSign, title: "Earnings",
    description: "Your monthly pay breakdown.",
    steps: ["See hours worked and pay per project for the current month", "Total monthly earnings displayed at the bottom"],
  },
];

function getHelpForRole(role: UserRole): HelpSection[] {
  switch (role) {
    case "owner": return OWNER_HELP;
    case "partner": return PARTNER_HELP;
    case "client": return CLIENT_HELP;
    case "staff": return STAFF_HELP;
    default: return CLIENT_HELP;
  }
}

export default function HelpPage() {
  const { effectiveProfile } = useAuth();
  const role = effectiveProfile?.role ?? "client";
  const sections = getHelpForRole(role);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Help & Guide
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Learn how to use Slate</p>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-3">
          {/* Quick tips */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Quick Tips</span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-2"><Search className="w-3 h-3 shrink-0" /> Press <kbd className="px-1 py-0.5 rounded bg-secondary text-[10px] font-mono">Cmd+K</kbd> to search anything</li>
              <li className="flex items-center gap-2"><Bell className="w-3 h-3 shrink-0" /> Check the bell icon for notifications</li>
              <li className="flex items-center gap-2"><Sun className="w-3 h-3 shrink-0" /> Toggle dark/light mode at the bottom of the sidebar</li>
              <li className="flex items-center gap-2"><MessageSquare className="w-3 h-3 shrink-0" /> In series chat, Claude can create episodes automatically — just ask!</li>
            </ul>
          </div>

          {/* Feature guides */}
          {sections.map((section, i) => {
            const isExpanded = expandedIndex === i;
            const Icon = section.icon;
            return (
              <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : i)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                >
                  <Icon className="w-5 h-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{section.title}</p>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3">
                    <ol className="space-y-2">
                      {section.steps.map((step, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium mt-0.5">
                            {j + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}

          <p className="text-center text-xs text-muted-foreground/50 pt-4">
            Slate by SDub Media
          </p>
        </div>
      </div>
    </div>
  );
}
