import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider } from "./contexts/AppContext";
import AppLayout from "./components/AppLayout";
import CalendarPage from "./pages/CalendarPage";
import InvoicePage from "./pages/InvoicePage";
import ClientsPage from "./pages/ClientsPage";
import LocationsPage from "./pages/LocationsPage";
import ManagePage from "./pages/ManagePage";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={CalendarPage} />
        <Route path="/invoice" component={InvoicePage} />
        <Route path="/clients" component={ClientsPage} />
        <Route path="/locations" component={LocationsPage} />
        <Route path="/manage" component={ManagePage} />
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
