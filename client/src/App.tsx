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
import { ConfirmProvider } from "./components/ConfirmProvider";
import PhotographyClientSetup from "./components/PhotographyClientSetup";
import StaffOnboarding from "./components/StaffOnboarding";
import { Film } from "lucide-react";

// Lazy-loaded pages for code splitting
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const LocationsPage = lazy(() => import("./pages/LocationsPage"));
const ManagePage = lazy(() => import("./pages/ManagePage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const CrewReportPage = lazy(() => import("./pages/CrewReportPage"));
const StaffPage = lazy(() => import("./pages/StaffPage"));
const MarketingBudgetPage = lazy(() => import("./pages/MarketingBudgetPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const MySchedulePage = lazy(() => import("./pages/MySchedulePage"));
const MyInvoicesPage = lazy(() => import("./pages/MyInvoicesPage"));
const ContractorInvoicesPage = lazy(() => import("./pages/ContractorInvoicesPage"));
const StaffPaymentsPage = lazy(() => import("./pages/StaffPaymentsPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const AvailabilityPage = lazy(() => import("./pages/AvailabilityPage"));
const MyHousesPage = lazy(() => import("./pages/MyHousesPage"));
const ShootRequestsPage = lazy(() => import("./pages/ShootRequestsPage"));
const BrokersPage = lazy(() => import("./pages/BrokersPage"));
const RealEstatePage = lazy(() => import("./pages/RealEstatePage"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
const OutstandingPaymentsPage = lazy(() => import("./pages/OutstandingPaymentsPage"));
const PipelineAnalyticsPage = lazy(() => import("./pages/PipelineAnalyticsPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const SeriesPage = lazy(() => import("./pages/SeriesPage"));
const ClientHealthPage = lazy(() => import("./pages/ClientHealthPage"));
const SeriesWorkspacePage = lazy(() => import("./pages/SeriesWorkspacePage"));
const EpisodeEditorPage = lazy(() => import("./pages/EpisodeEditorPage"));
const SeriesReviewPage = lazy(() => import("./pages/SeriesReviewPage"));
const InvoicePublicPage = lazy(() => import("./pages/InvoicePublicPage"));
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
const NewContractPage = lazy(() => import("./pages/NewContractPage"));
const EditContractPage = lazy(() => import("./pages/EditContractPage"));
const DeliveriesPage = lazy(() => import("./pages/DeliveriesPage"));
const SignContractPage = lazy(() => import("./pages/SignContractPage"));
const ProposalsPage = lazy(() => import("./pages/ProposalsPage"));
const TemplateEditorPage = lazy(() => import("./pages/TemplateEditorPage"));
const PackagesPage = lazy(() => import("./pages/PackagesPage"));
const ReviewContractPage = lazy(() => import("./pages/ReviewContractPage"));
const EditContractTemplatePage = lazy(() => import("./pages/EditContractTemplatePage"));
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
const SupportPage = lazy(() => import("./pages/SupportPage"));

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

// Shown to a staff member whose account isn't linked to a crew profile yet.
// Without the link, row-level security returns nothing — they'd otherwise see
// blank schedule/mileage/invoice screens and a cryptic "permission denied" when
// submitting. This explains it instead. (Also shown if an owner previews such a
// staff account via impersonation — with an Exit-preview button.)
function StaffSetupPendingScreen({ impersonating, onExitPreview, onSignOut }: { impersonating: boolean; onExitPreview: () => void; onSignOut: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background flex-col gap-4 px-6">
      <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
        <Film className="w-6 h-6 text-primary-foreground" />
      </div>
      <div className="text-lg font-semibold text-foreground text-center" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        Almost there — your account isn't set up yet
      </div>
      <div className="text-sm text-muted-foreground max-w-sm text-center">
        Your login isn't linked to your crew profile yet, so your schedule, mileage, and invoices won't show.
        Ask your admin to finish linking your account, then sign back in.
      </div>
      {impersonating ? (
        <button onClick={onExitPreview} className="text-xs text-primary underline mt-2">Exit preview</button>
      ) : (
        <button onClick={onSignOut} className="text-xs text-primary underline mt-2">Sign out</button>
      )}
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
  const { effectiveProfile, impersonateUserId, setImpersonateUserId, signOut } = useAuth();
  const { loading, error, data } = useApp();
  const [location, navigate] = useLocation();

  const role = effectiveProfile?.role ?? "client";
  const isOwner = role === "owner";
  const isPartner = role === "partner";
  const isStaff = role === "staff";
  const isFamily = role === "family";
  // Owner + partner are the internal roles that may see finance/admin pages.
  // Other roles that navigate to those URLs directly are sent home rather
  // than shown an empty page shell.
  const internal = isOwner || isPartner;

  // Belt-and-suspenders redirect for family — catches the case where
  // effectiveProfile loads after the initial route match.
  useEffect(() => {
    if (isFamily && location === "/") navigate("/calendar", { replace: true });
  }, [isFamily, location, navigate]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (isStaff && !effectiveProfile?.crewMemberId) {
    return <StaffSetupPendingScreen impersonating={!!impersonateUserId} onExitPreview={() => setImpersonateUserId(null)} onSignOut={signOut} />;
  }

  // New staff must finish required onboarding (info + signed 1099 + W-9) before
  // the app opens. Owner preview (impersonation) bypasses it, same as the
  // photography-client gate below.
  if (
    isStaff &&
    effectiveProfile?.crewMemberId &&
    !effectiveProfile?.staffOnboardingCompletedAt &&
    !impersonateUserId
  ) {
    return <StaffOnboarding profile={effectiveProfile} />;
  }

  // Photography clients must finish required setup (address, phone, card on
  // file) before the portal opens. Owner preview (impersonation) bypasses it.
  const myClientRecord = role === "client"
    ? data.clients.find(c => (effectiveProfile?.clientIds ?? []).includes(c.id))
    : null;
  if (
    !impersonateUserId &&
    myClientRecord?.clientType === "photography" &&
    (!myClientRecord.address?.trim() || !myClientRecord.phone?.trim() || !myClientRecord.cardOnFile)
  ) {
    return <PhotographyClientSetup client={myClientRecord} />;
  }

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
        {isOwner && <Route path="/settings">{() => <SettingsPage />}</Route>}
        {isOwner && <Route path="/users">{() => <UsersPage />}</Route>}
        {isOwner && <Route path="/trash" component={TrashPage} />}
        {isOwner && <Route path="/proposals/templates/:id/edit" component={TemplateEditorPage} />}
        {isOwner && <Route path="/packages" component={PackagesPage} />}
        {isOwner && <Route path="/contracts/:id/review" component={ReviewContractPage} />}
        {isOwner && <Route path="/contracts/templates/:id/edit" component={EditContractTemplatePage} />}

        {/* Feature-gated pages — sidebar toggles control visibility, routes always available */}
        <Route path="/calendar" component={CalendarPage} />
        {(isOwner || isPartner) && <Route path="/contractor-invoices" component={ContractorInvoicesPage} />}
        {isOwner && <Route path="/staff-payments" component={StaffPaymentsPage} />}
        {isOwner && <Route path="/products" component={ProductsPage} />}
        <Route path="/availability" component={AvailabilityPage} />
        {/* My Listings is the agent/broker (client-role) home. Owners who land
            here are sent to the request queue; everyone else to the calendar. */}
        <Route path="/my-houses">{() => role === "client" ? <MyHousesPage /> : <Redirect to={isOwner ? "/shoot-requests" : "/calendar"} />}</Route>
        {isOwner && <Route path="/shoot-requests" component={ShootRequestsPage} />}
        <Route path="/billing">{() => internal ? <BillingPage /> : <Redirect to="/" />}</Route>
        <Route path="/reports">{() => internal ? <ReportsPage /> : <Redirect to="/" />}</Route>
        {isOwner && <Route path="/crew-report" component={CrewReportPage} />}
        <Route path="/clients">{() => internal ? <ClientsPage /> : <Redirect to="/" />}</Route>
        <Route path="/brokers">{() => internal ? <BrokersPage /> : <Redirect to="/" />}</Route>
        {isOwner && <Route path="/real-estate" component={RealEstatePage} />}
        <Route path="/staff">{() => internal ? <StaffPage /> : <Redirect to="/" />}</Route>
        <Route path="/invoices">{() => internal ? <InvoicesPage /> : <Redirect to="/" />}</Route>
        <Route path="/outstanding-payments">{() => internal ? <OutstandingPaymentsPage /> : <Redirect to="/" />}</Route>
        {isOwner && <Route path="/pipeline-analytics" component={PipelineAnalyticsPage} />}
        {isOwner && <Route path="/series" component={SeriesPage} />}
        {isOwner && <Route path="/series/:id/episode/:episodeId" component={EpisodeEditorPage} />}
        {isOwner && <Route path="/series/:id" component={SeriesWorkspacePage} />}
        <Route path="/marketing-budget">{() => internal ? <MarketingBudgetPage /> : <Redirect to="/" />}</Route>
        <Route path="/client-health">{() => internal ? <ClientHealthPage /> : <Redirect to="/" />}</Route>
        <Route path="/locations">{() => internal ? <LocationsPage /> : <Redirect to="/" />}</Route>
        <Route path="/mileage" component={MileageReportPage} />
        <Route path="/profit-loss">{() => internal ? <ProfitLossPage /> : <Redirect to="/" />}</Route>
        <Route path="/expenses">{() => internal ? <BusinessExpensesPage /> : <Redirect to="/" />}</Route>
        <Route path="/contracts">{() => internal ? <ContractsPage /> : <Redirect to="/" />}</Route>
        {isOwner && <Route path="/contracts/new" component={NewContractPage} />}
        {isOwner && <Route path="/contracts/:id/edit" component={EditContractPage} />}
        <Route path="/deliveries">{() => internal ? <DeliveriesPage /> : <Redirect to="/" />}</Route>
        <Route path="/deliveries/:id">{() => internal ? <DeliveriesPage /> : <Redirect to="/" />}</Route>
        <Route path="/proposals">{() => internal ? <ProposalsPage /> : <Redirect to="/" />}</Route>
        <Route path="/pipeline">{() => internal ? <PipelinePage /> : <Redirect to="/" />}</Route>
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
  // Staff use the required staff-onboarding flow (info → 1099 → W-9) inside the
  // app, not this generic welcome — which lives outside AppProvider and would
  // crash reading app data. Route them straight in.
  if (!profile?.hasCompletedOnboarding && profile?.role !== "staff") return <Suspense fallback={<LoadingScreen />}><OnboardingPage /></Suspense>;
  return (
    <AppProvider>
      <FaviconSync />
      <ConfirmProvider>
        <Router />
      </ConfirmProvider>
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

  if (window.location.pathname.startsWith("/invoice/")) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Toaster />
          <Switch>
            <Route path="/invoice/:token" component={InvoicePublicPage} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (window.location.pathname.startsWith("/review/series/")) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Toaster />
          <Switch>
            <Route path="/review/series/:token" component={SeriesReviewPage} />
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

  // Legal + support pages — always public so Stripe + marketing sites + the
  // App Store listing can link in.
  const legalPath = window.location.pathname;
  if (legalPath === "/terms" || legalPath === "/refund" || legalPath === "/privacy" || legalPath === "/support") {
    const Page = legalPath === "/terms" ? TermsPage : legalPath === "/refund" ? RefundPage : legalPath === "/support" ? SupportPage : PrivacyPage;
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
