import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppProvider, useApp } from "./contexts/AppContext";
import AppLayout from "./components/AppLayout";
import CalendarPage from "./pages/CalendarPage";
import BillingPage from "./pages/BillingPage";
import ClientsPage from "./pages/ClientsPage";
import LocationsPage from "./pages/LocationsPage";
import ManagePage from "./pages/ManagePage";
import ReportsPage from "./pages/ReportsPage";
import StaffPage from "./pages/StaffPage";
import MarketingBudgetPage from "./pages/MarketingBudgetPage";
import UsersPage from "./pages/UsersPage";
import MySchedulePage from "./pages/MySchedulePage";
import LoginPage from "./pages/LoginPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import { Film } from "lucide-react";

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background flex-col gap-4">
      <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
        <Film className="w-6 h-6 text-primary-foreground" />
      </div>
      <div className="text-sm text-muted-foreground">Loading FilmProject Pro...</div>
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
  const { profile } = useAuth();
  const { loading, error } = useApp();
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;

  const role = profile?.role ?? "client";
  const isOwner = role === "owner";
  const isPartner = role === "partner";
  const isStaff = role === "staff";

  return (
    <AppLayout>
      <Switch>
        {isStaff ? (
          <Route path="/" component={MySchedulePage} />
        ) : (
          <Route path="/" component={CalendarPage} />
        )}
        {isStaff && <Route path="/my-schedule" component={MySchedulePage} />}
        {!isStaff && <Route path="/billing" component={BillingPage} />}
        {!isStaff && <Route path="/reports" component={ReportsPage} />}
        {(isOwner || isPartner) && <Route path="/clients" component={ClientsPage} />}
        {(isOwner || isPartner) && <Route path="/staff" component={StaffPage} />}
        {(isOwner || isPartner) && <Route path="/marketing-budget" component={MarketingBudgetPage} />}
        {isOwner && <Route path="/locations" component={LocationsPage} />}
        {isOwner && <Route path="/manage" component={ManagePage} />}
        {isOwner && <Route path="/users" component={UsersPage} />}
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function AuthGate() {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <LoginPage />;
  if (profile?.mustChangePassword) return <ChangePasswordPage />;
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
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
