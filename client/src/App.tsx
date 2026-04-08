import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppProvider, useApp } from "./contexts/AppContext";
import AppLayout from "./components/AppLayout";
import { Film } from "lucide-react";

// Lazy-loaded pages for code splitting
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const LocationsPage = lazy(() => import("./pages/LocationsPage"));
const ManagePage = lazy(() => import("./pages/ManagePage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const StaffPage = lazy(() => import("./pages/StaffPage"));
const MarketingBudgetPage = lazy(() => import("./pages/MarketingBudgetPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const MySchedulePage = lazy(() => import("./pages/MySchedulePage"));
const MyInvoicesPage = lazy(() => import("./pages/MyInvoicesPage"));
const ContractorInvoicesPage = lazy(() => import("./pages/ContractorInvoicesPage"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const SeriesPage = lazy(() => import("./pages/SeriesPage"));
const ClientHealthPage = lazy(() => import("./pages/ClientHealthPage"));
const SeriesWorkspacePage = lazy(() => import("./pages/SeriesWorkspacePage"));
const ClientDashboardPage = lazy(() => import("./pages/ClientDashboardPage"));
const StaffDashboardPage = lazy(() => import("./pages/StaffDashboardPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ChangePasswordPage = lazy(() => import("./pages/ChangePasswordPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const ClientReportsPage = lazy(() => import("./pages/ClientReportsPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const MileageReportPage = lazy(() => import("./pages/MileageReportPage"));
const ProfitLossPage = lazy(() => import("./pages/ProfitLossPage"));
const BusinessExpensesPage = lazy(() => import("./pages/BusinessExpensesPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ContractsPage = lazy(() => import("./pages/ContractsPage"));
const SignContractPage = lazy(() => import("./pages/SignContractPage"));
const ProposalsPage = lazy(() => import("./pages/ProposalsPage"));
const TemplateEditorPage = lazy(() => import("./pages/TemplateEditorPage"));
const ViewProposalPage = lazy(() => import("./pages/ViewProposalPage"));
const PipelinePage = lazy(() => import("./pages/PipelinePage"));
const TrashPage = lazy(() => import("./pages/TrashPage"));
const CalendarSyncPage = lazy(() => import("./pages/CalendarSyncPage"));
const ContractorSummaryPage = lazy(() => import("./pages/ContractorSummaryPage"));

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background flex-col gap-4">
      <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
        <Film className="w-6 h-6 text-primary-foreground" />
      </div>
      <div className="text-sm text-muted-foreground">Loading Slate...</div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background flex-col gap-3">
      <div className="text-destructive font-semibold">Failed to connect to database</div>
      <div className="text-sm text-muted-foreground max-w-sm text-center">{message}</div>
      <button onClick={() => window.location.reload()} className="text-xs text-primary underline mt-2">Retry</button>
    </div>
  );
}

function Router() {
  const { effectiveProfile } = useAuth();
  const { loading, error } = useApp();
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

  const role = effectiveProfile?.role ?? "client";
  const isOwner = role === "owner";
  const isPartner = role === "partner";
  const isStaff = role === "staff";

  return (
    <AppLayout>
      <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="text-sm text-muted-foreground">Loading...</div></div>}>
      <Switch>
        {isStaff ? (
          <Route path="/" component={StaffDashboardPage} />
        ) : (isOwner || isPartner) ? (
          <Route path="/" component={DashboardPage} />
        ) : (
          <Route path="/" component={ClientDashboardPage} />
        )}
        {isStaff && <Route path="/my-schedule" component={MySchedulePage} />}
        {isStaff && <Route path="/my-invoices" component={MyInvoicesPage} />}
        {(isOwner || isPartner) && <Route path="/contractor-invoices" component={ContractorInvoicesPage} />}
        {!isStaff && <Route path="/calendar" component={CalendarPage} />}
        {(isOwner || isPartner) && <Route path="/billing" component={BillingPage} />}
        {(isOwner || isPartner) && <Route path="/reports" component={ReportsPage} />}
        {role === "client" && <Route path="/my-reports" component={ClientReportsPage} />}
        {(isOwner || isPartner) && <Route path="/clients" component={ClientsPage} />}
        {(isOwner || isPartner) && <Route path="/staff" component={StaffPage} />}
        {(isOwner || isPartner) && <Route path="/invoices" component={InvoicesPage} />}
        <Route path="/series" component={SeriesPage} />
        <Route path="/series/:id" component={SeriesWorkspacePage} />
        {(isOwner || isPartner) && <Route path="/marketing-budget" component={MarketingBudgetPage} />}
        {(isOwner || isPartner) && <Route path="/client-health" component={ClientHealthPage} />}
        {isOwner && <Route path="/locations" component={LocationsPage} />}
        {isOwner && <Route path="/manage" component={ManagePage} />}
        {isOwner && <Route path="/settings" component={SettingsPage} />}
        {isOwner && <Route path="/users" component={UsersPage} />}
        <Route path="/mileage" component={MileageReportPage} />
        {(isOwner || isPartner) && <Route path="/profit-loss" component={ProfitLossPage} />}
        {isOwner && <Route path="/expenses" component={BusinessExpensesPage} />}
        {(isOwner || isPartner) && <Route path="/contracts" component={ContractsPage} />}
        {(isOwner || isPartner) && <Route path="/proposals" component={ProposalsPage} />}
        {isOwner && <Route path="/proposals/templates/:id/edit" component={TemplateEditorPage} />}
        {(isOwner || isPartner) && <Route path="/pipeline" component={PipelinePage} />}
        {(isOwner || isStaff) && <Route path="/1099" component={ContractorSummaryPage} />}
        {isOwner && <Route path="/trash" component={TrashPage} />}
        <Route path="/calendar-sync" component={CalendarSyncPage} />
        <Route path="/help" component={HelpPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
      </Suspense>
    </AppLayout>
  );
}

function AuthGate() {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Suspense fallback={<LoadingScreen />}><LoginPage /></Suspense>;
  if (profile?.mustChangePassword) return <Suspense fallback={<LoadingScreen />}><ChangePasswordPage /></Suspense>;
  if (!profile?.hasCompletedOnboarding && profile?.role !== "owner") return <Suspense fallback={<LoadingScreen />}><OnboardingPage /></Suspense>;
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}

function App() {
  // Public pages — no auth required
  if (window.location.pathname.startsWith("/sign/")) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Toaster />
          <Switch>
            <Route path="/sign/:token" component={SignContractPage} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (window.location.pathname.startsWith("/proposal/")) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Toaster />
          <Switch>
            <Route path="/proposal/:token" component={ViewProposalPage} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <AuthProvider>
          <TooltipProvider>
            <Toaster theme="dark" />
            <AuthGate />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
