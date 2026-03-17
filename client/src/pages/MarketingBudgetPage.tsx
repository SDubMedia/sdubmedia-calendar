// ============================================================
// Marketing Budget Page — Track annual marketing budget and expenses
// Budget = 10% of total client billing for the year
// Design: Dark Cinematic Studio | Amber accent on charcoal
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import type { ExpenseCategory } from "@/lib/types";
import { Trash2, Plus, X, DollarSign, Receipt, PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { getProjectInvoiceAmount } from "@/lib/data";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const CATEGORIES: ExpenseCategory[] = ["Equipment", "Software", "Advertising", "Travel", "Other"];

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

export default function MarketingBudgetPage() {
  const { data, addMarketingExpense, deleteMarketingExpense } = useApp();
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    category: "Other" as ExpenseCategory,
    description: "",
    notes: "",
    amount: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Calculate total billing for the year (all clients, all projects)
  const totalBilling = useMemo(() => {
    return data.projects
      .filter(p => p.date.startsWith(String(selectedYear)))
      .reduce((sum, p) => {
        const client = data.clients.find(c => c.id === p.clientId);
        if (!client) return sum;
        return sum + getProjectInvoiceAmount(p, client);
      }, 0);
  }, [data.projects, data.clients, selectedYear]);

  // Budget = 10% of total billing
  const totalBudget = totalBilling * 0.10;

  // Expenses for selected year
  const yearExpenses = useMemo(() => {
    return data.marketingExpenses.filter(e => e.date.startsWith(String(selectedYear)));
  }, [data.marketingExpenses, selectedYear]);

  const totalExpenses = yearExpenses.reduce((s, e) => s + e.amount, 0);
  const remaining = totalBudget - totalExpenses;

  // Monthly breakdown: billing earned and expenses per month
  const monthlyBreakdown = useMemo(() => {
    return MONTHS.map((name, idx) => {
      const monthNum = idx + 1;
      const monthStr = `${selectedYear}-${String(monthNum).padStart(2, "0")}`;

      const monthBilling = data.projects
        .filter(p => p.date.startsWith(monthStr))
        .reduce((sum, p) => {
          const client = data.clients.find(c => c.id === p.clientId);
          if (!client) return sum;
          return sum + getProjectInvoiceAmount(p, client);
        }, 0);

      const budgetAdded = monthBilling * 0.10;
      const monthExpenses = yearExpenses
        .filter(e => e.date.startsWith(monthStr))
        .reduce((s, e) => s + e.amount, 0);

      return { name, budgetAdded, monthExpenses, net: budgetAdded - monthExpenses };
    });
  }, [data.projects, data.clients, yearExpenses, selectedYear]);

  const handleSubmit = async () => {
    if (!formData.description.trim()) { toast.error("Description is required"); return; }
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }

    setSubmitting(true);
    try {
      await addMarketingExpense({
        date: formData.date,
        category: formData.category,
        description: formData.description.trim(),
        notes: formData.notes.trim(),
        amount,
      });
      toast.success("Expense added");
      setFormData({ date: new Date().toISOString().split("T")[0], category: "Other", description: "", notes: "", amount: "" });
      setShowForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMarketingExpense(id);
      toast.success("Expense removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete expense");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Marketing Budget
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            10% of annual billing value
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Expense</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {/* Year selector */}
        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total Budget</span>
            </div>
            <p className="text-2xl font-bold text-blue-400 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {formatCurrency(totalBudget)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">10% of {formatCurrency(totalBilling)} billed</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-md bg-red-500/10 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-red-400" />
              </div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total Expenses</span>
            </div>
            <p className="text-2xl font-bold text-red-400 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {formatCurrency(totalExpenses)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{yearExpenses.length} expense{yearExpenses.length !== 1 ? "s" : ""}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("w-8 h-8 rounded-md flex items-center justify-center", remaining >= 0 ? "bg-green-500/10" : "bg-red-500/10")}>
                <PiggyBank className={cn("w-4 h-4", remaining >= 0 ? "text-green-400" : "text-red-400")} />
              </div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Remaining Budget</span>
            </div>
            <p className={cn("text-2xl font-bold tabular-nums", remaining >= 0 ? "text-green-400" : "text-red-400")} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {formatCurrency(remaining)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Available</p>
          </div>
        </div>

        {/* Monthly Breakdown */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Monthly Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Month</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Budget Added</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Expenses</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Net</th>
                </tr>
              </thead>
              <tbody>
                {monthlyBreakdown.map(m => (
                  <tr key={m.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 text-foreground">{m.name}</td>
                    <td className="px-4 py-2 text-right text-blue-400 tabular-nums">{m.budgetAdded > 0 ? formatCurrency(m.budgetAdded) : "—"}</td>
                    <td className="px-4 py-2 text-right text-red-400 tabular-nums">{m.monthExpenses > 0 ? formatCurrency(m.monthExpenses) : "—"}</td>
                    <td className={cn("px-4 py-2 text-right font-medium tabular-nums", m.net >= 0 ? "text-green-400" : "text-red-400")}>
                      {(m.budgetAdded > 0 || m.monthExpenses > 0) ? formatCurrency(m.net) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="px-4 py-2 font-bold text-foreground">Total</td>
                  <td className="px-4 py-2 text-right font-bold text-blue-400 tabular-nums">{formatCurrency(totalBudget)}</td>
                  <td className="px-4 py-2 text-right font-bold text-red-400 tabular-nums">{formatCurrency(totalExpenses)}</td>
                  <td className={cn("px-4 py-2 text-right font-bold tabular-nums", remaining >= 0 ? "text-green-400" : "text-red-400")}>{formatCurrency(remaining)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Add Expense Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Add Expense
              </h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData(f => ({ ...f, date: e.target.value }))}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={e => setFormData(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Amaran Tube Lights for Podcast Room"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional details"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={e => setFormData(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Expense"}
              </button>
            </div>
          </div>
        )}

        {/* Expense History */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Expense History
          </h2>

          {yearExpenses.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <Receipt className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No expenses recorded for {selectedYear}</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Click "Add Expense" to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {yearExpenses.map(expense => (
                <div key={expense.id} className="bg-card border border-border rounded-lg p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm text-muted-foreground">
                        {new Date(expense.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {expense.category}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-foreground">{expense.description}</p>
                    {expense.notes && (
                      <p className="text-sm text-muted-foreground mt-0.5">{expense.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xl font-bold text-foreground tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {formatCurrency(expense.amount)}
                    </span>
                    <button
                      onClick={() => handleDelete(expense.id)}
                      className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                      title="Delete expense"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
