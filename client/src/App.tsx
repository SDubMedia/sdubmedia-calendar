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
        {!isStaff && <Route path="/calendar" component={CalendarPage} />}
        {(isOwner || isPartner) && <Route path="/billing" component={BillingPage} />}
        {(isOwner || isPartner) && <Route path="/reports" component={ReportsPage} />}
        {role === "client" && <Route path="/my-reports" component={ClientReportsPage} />}
        {(isOwner || isPartner) && <Route path="/clients" component={ClientsPage} />}
        {(isOwner || isPartner) && <Route path="/staff" component={StaffPage} />}
        {(isOwner || isPartner) && <Route path="/invoices" component={InvoicesPage} />}
        {!isStaff && <Route path="/series" component={SeriesPage} />}
        {!isStaff && <Route path="/series/:id" component={SeriesWorkspacePage} />}
        {(isOwner || isPartner) && <Route path="/marketing-budget" component={MarketingBudgetPage} />}
        {(isOwner || isPartner) && <Route path="/client-health" component={ClientHealthPage} />}
        {isOwner && <Route path="/locations" component={LocationsPage} />}
        {isOwner && <Route path="/manage" component={ManagePage} />}
        {isOwner && <Route path="/users" component={UsersPage} />}
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
