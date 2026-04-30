import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { useEffect } from "react";
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
const DeliveriesPage = lazy(() => import("./pages/DeliveriesPage"));
const SignContractPage = lazy(() => import("./pages/SignContractPage"));
const ProposalsPage = lazy(() => import("./pages/ProposalsPage"));
const TemplateEditorPage = lazy(() => import("./pages/TemplateEditorPage"));
const ViewProposalPage = lazy(() => import("./pages/ViewProposalPage"));
const DeliverGalleryPage = lazy(() => import("./pages/DeliverGalleryPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const CollectionPage = lazy(() => import("./pages/CollectionPage"));
const PipelinePage = lazy(() => import("./pages/PipelinePage"));
const TrashPage = lazy(() => import("./pages/TrashPage"));
const CalendarSyncPage = lazy(() => import("./pages/CalendarSyncPage"));
const ContractorSummaryPage = lazy(() => import("./pages/ContractorSummaryPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const RefundPage = lazy(() => import("./pages/RefundPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));

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
  const [location, navigate] = useLocation();

  const role = effectiveProfile?.role ?? "client";
  const isOwner = role === "owner";
  const isPartner = role === "partner";
  const isStaff = role === "staff";
  const isFamily = role === "family";

  // Belt-and-suspenders redirect for family — catches the case where
  // effectiveProfile loads after the initial route match.
  useEffect(() => {
    if (isFamily && location === "/") navigate("/calendar", { replace: true });
  }, [isFamily, location, navigate]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

  return (
    <AppLayout>
      <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="text-sm text-muted-foreground">Loading...</div></div>}>
      <Switch>
        {isFamily ? (
          <Route path="/"><Redirect to="/calendar" /></Route>
        ) : isStaff ? (
          <Route path="/" component={StaffDashboardPage} />
        ) : (isOwner || isPartner) ? (
          <Route path="/" component={DashboardPage} />
        ) : (
          <Route path="/" component={ClientDashboardPage} />
        )}
        {/* Role-specific views */}
        {isStaff && <Route path="/my-schedule" component={MySchedulePage} />}
        {isStaff && <Route path="/my-invoices" component={MyInvoicesPage} />}
        {role === "client" && <Route path="/my-reports" component={ClientReportsPage} />}

        {/* Owner-only admin (no feature toggle) */}
        {isOwner && <Route path="/manage" component={ManagePage} />}
        {isOwner && <Route path="/settings" component={SettingsPage} />}
        {isOwner && <Route path="/users" component={UsersPage} />}
        {isOwner && <Route path="/trash" component={TrashPage} />}
        {isOwner && <Route path="/proposals/templates/:id/edit" component={TemplateEditorPage} />}

        {/* Feature-gated pages — sidebar toggles control visibility, routes always available */}
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/contractor-invoices" component={ContractorInvoicesPage} />
        <Route path="/billing" component={BillingPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/clients" component={ClientsPage} />
        <Route path="/staff" component={StaffPage} />
        <Route path="/invoices" component={InvoicesPage} />
        <Route path="/series" component={SeriesPage} />
        <Route path="/series/:id" component={SeriesWorkspacePage} />
        <Route path="/marketing-budget" component={MarketingBudgetPage} />
        <Route path="/client-health" component={ClientHealthPage} />
        <Route path="/locations" component={LocationsPage} />
        <Route path="/mileage" component={MileageReportPage} />
        <Route path="/profit-loss" component={ProfitLossPage} />
        <Route path="/expenses" component={BusinessExpensesPage} />
        <Route path="/contracts" component={ContractsPage} />
        <Route path="/deliveries" component={DeliveriesPage} />
        <Route path="/deliveries/:id" component={DeliveriesPage} />
        <Route path="/proposals" component={ProposalsPage} />
        <Route path="/pipeline" component={PipelinePage} />
        <Route path="/1099" component={ContractorSummaryPage} />
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
      <FaviconSync />
      <Router />
    </AppProvider>
  );
}

// Keep the browser tab icon in sync with the org's chosen favicon. Empty
// string clears any custom icon (browser falls back to default).
function FaviconSync() {
  const { data } = useApp();
  const url = data.organization?.faviconUrl || "";
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    if (url) {
      link.href = url;
    } else if (link.href) {
      // Remove any previously-set icon so the browser uses its default.
      link.removeAttribute("href");
    }
  }, [url]);
  return null;
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

  if (window.location.pathname.startsWith("/deliver/") || window.location.pathname.startsWith("/g/") || window.location.pathname.startsWith("/c/")) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Toaster />
          <Switch>
            <Route path="/deliver/:token" component={DeliverGalleryPage} />
            <Route path="/g/:token" component={DeliverGalleryPage} />
            <Route path="/c/:slug" component={CollectionPage} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (window.location.pathname === "/reset-password") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Toaster />
          <Switch>
            <Route path="/reset-password" component={ResetPasswordPage} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Legal pages — always public so Stripe + marketing sites can link in
  const legalPath = window.location.pathname;
  if (legalPath === "/terms" || legalPath === "/refund" || legalPath === "/privacy") {
    const Page = legalPath === "/terms" ? TermsPage : legalPath === "/refund" ? RefundPage : PrivacyPage;
    return (
      <ErrorBoundary>
        <ThemeProvider defaultTheme="dark" switchable>
          <Suspense fallback={<LoadingScreen />}>
            <Toaster theme="dark" />
            <Page />
          </Suspense>
        </ThemeProvider>
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
