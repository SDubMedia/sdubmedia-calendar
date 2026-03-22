// ============================================================
// GlobalSearch — Search across projects, clients, crew, invoices
// ============================================================

import { useState, useMemo, useRef, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { useLocation } from "wouter";
import { Search, X, CalendarDays, Users, Users2, FileText, Film } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  type: "project" | "client" | "crew" | "invoice" | "series";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export default function GlobalSearch() {
  const { data } = useApp();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const matches: SearchResult[] = [];

    // Projects
    data.projects.forEach(p => {
      const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
      const client = data.clients.find(c => c.id === p.clientId);
      const loc = data.locations.find(l => l.id === p.locationId);
      const searchText = `${pType?.name} ${client?.company} ${loc?.name} ${p.date} ${p.notes}`.toLowerCase();
      if (searchText.includes(q)) {
        matches.push({
          type: "project",
          id: p.id,
          title: `${pType?.name ?? "Project"} — ${p.date}`,
          subtitle: client?.company ?? "",
          href: "/calendar",
        });
      }
    });

    // Clients
    data.clients.forEach(c => {
      const searchText = `${c.company} ${c.contactName} ${c.email} ${c.phone}`.toLowerCase();
      if (searchText.includes(q)) {
        matches.push({
          type: "client",
          id: c.id,
          title: c.company,
          subtitle: c.contactName,
          href: "/clients",
        });
      }
    });

    // Crew
    data.crewMembers.forEach(cm => {
      const searchText = `${cm.name} ${cm.email} ${cm.phone}`.toLowerCase();
      if (searchText.includes(q)) {
        matches.push({
          type: "crew",
          id: cm.id,
          title: cm.name,
          subtitle: cm.roleRates.map(r => r.role).join(", "),
          href: "/staff",
        });
      }
    });

    // Invoices
    data.invoices.forEach(inv => {
      const client = data.clients.find(c => c.id === inv.clientId);
      const searchText = `${inv.invoiceNumber} ${client?.company} ${inv.clientInfo.company}`.toLowerCase();
      if (searchText.includes(q)) {
        matches.push({
          type: "invoice",
          id: inv.id,
          title: inv.invoiceNumber,
          subtitle: `${client?.company ?? inv.clientInfo.company} — $${inv.total.toFixed(2)}`,
          href: "/invoices",
        });
      }
    });

    // Series
    data.series.forEach(s => {
      const client = data.clients.find(c => c.id === s.clientId);
      const searchText = `${s.name} ${client?.company} ${s.goal}`.toLowerCase();
      if (searchText.includes(q)) {
        matches.push({
          type: "series",
          id: s.id,
          title: s.name,
          subtitle: client?.company ?? "",
          href: `/series/${s.id}`,
        });
      }
    });

    return matches.slice(0, 10);
  }, [query, data]);

  const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    project: CalendarDays,
    client: Users,
    crew: Users2,
    invoice: FileText,
    series: Film,
  };

  const typeLabels: Record<string, string> = {
    project: "Project",
    client: "Client",
    crew: "Crew",
    invoice: "Invoice",
    series: "Series",
  };

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    setLocation(result.href);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary/50 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors text-xs"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline text-[10px] bg-background px-1 py-0.5 rounded border border-border ml-1">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => { setOpen(false); setQuery(""); }}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects, clients, crew, invoices, series..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button onClick={() => { setOpen(false); setQuery(""); }} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {query.trim() && (
          <div className="max-h-80 overflow-auto">
            {results.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No results found</div>
            ) : (
              results.map(result => {
                const Icon = typeIcons[result.type];
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{result.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{typeLabels[result.type]}</span>
                  </button>
                );
              })
            )}
          </div>
        )}

        {!query.trim() && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Start typing to search across everything
          </div>
        )}
      </div>
    </div>
  );
}
