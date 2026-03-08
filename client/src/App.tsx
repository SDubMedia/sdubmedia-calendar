import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider, useApp } from "./contexts/AppContext";
import AppLayout from "./components/AppLayout";
import CalendarPage from "./pages/CalendarPage";
import BillingPage from "./pages/BillingPage";
import ClientsPage from "./pages/ClientsPage";
import LocationsPage from "./pages/LocationsPage";
import ManagePage from "./pages/ManagePage";
import ReportsPage from "./pages/ReportsPage";
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
  const { loading, error } = useApp();
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={CalendarPage} />
        <Route path="/billing" component={BillingPage} />
        <Route path="/clients" component={ClientsPage} />
        <Route path="/locations" component={LocationsPage} />
        <Route path="/manage" component={ManagePage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AppProvider>
          <TooltipProvider>
            <Toaster theme="dark" />
            <Router />
          </TooltipProvider>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
