// ============================================================
// BusinessExpensesPage — Chase CSV import + manual expense tracking
// Owner-only. Printable annual report by category for CPA.
// ============================================================

import { useState, useMemo, useRef } from "react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import type { BusinessExpenseCategory, BusinessExpense } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, Plus, Trash2, Printer, ChevronLeft, ChevronRight, FileText, X, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/supabase";

const CATEGORIES: BusinessExpenseCategory[] = [
  "Equipment", "Software", "Travel", "Meals", "Advertising",
  "Office", "Insurance", "Vehicle", "Education", "Subscriptions", "Other", "Personal",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

interface CsvRow {
  date: string;
  description: string;
  category: BusinessExpenseCategory;
  amount: number;
  chaseCategory: string;
  selected: boolean;
}

function parseChaseCSV(text: string): CsvRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  // Find header row
  const headerLine = lines[0];
  const headers = headerLine.split(",").map(h => h.trim().replace(/"/g, ""));

  const dateIdx = headers.findIndex(h => /transaction.*date/i.test(h));
  const descIdx = headers.findIndex(h => /description/i.test(h));
  const catIdx = headers.findIndex(h => /category/i.test(h));
  const amtIdx = headers.findIndex(h => /amount/i.test(h));
  const typeIdx = headers.findIndex(h => /type/i.test(h));

  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV respecting quotes
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cols.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    cols.push(current.trim());

    // Skip payments/credits
    const type = typeIdx >= 0 ? cols[typeIdx] : "";
    if (/payment/i.test(type) || /return/i.test(type)) continue;

    const amount = Math.abs(parseFloat(cols[amtIdx]) || 0);
    if (amount === 0) continue;

    // Parse date MM/DD/YYYY → YYYY-MM-DD
    const dateParts = (cols[dateIdx] || "").split("/");
    const date = dateParts.length === 3
      ? `${dateParts[2]}-${dateParts[0].padStart(2, "0")}-${dateParts[1].padStart(2, "0")}`
      : cols[dateIdx];

    rows.push({
      date,
      description: cols[descIdx] || "",
      category: "Other",
      amount,
      chaseCategory: catIdx >= 0 ? cols[catIdx] : "",
      selected: true,
    });
  }
  return rows;
}

export default function BusinessExpensesPage() {
  const { data, addBusinessExpenses, addBusinessExpense, updateBusinessExpense, deleteBusinessExpense, upsertCategoryRule } = useApp();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [view, setView] = useState<"list" | "report">("list");

  // CSV upload state
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Category picker state
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [catPickerIndex, setCatPickerIndex] = useState<number | null>(null); // index in csvRows, or null for edit mode
  const [catPickerTarget, setCatPickerTarget] = useState<string | null>(null); // expense ID for edit mode
  const [customCategory, setCustomCategory] = useState("");

  // All categories: built-in + any custom ones from existing expenses
  const allCategories = useMemo(() => {
    const custom = data.businessExpenses
      .map(e => e.category)
      .filter(c => !CATEGORIES.includes(c as any) && c !== "Other");
    return [...CATEGORIES, ...Array.from(new Set(custom))];
  }, [data.businessExpenses]);

  function openCatPicker(index: number) {
    setCatPickerIndex(index);
    setCatPickerTarget(null);
    setCatPickerOpen(true);
    setCustomCategory("");
  }

  function openCatPickerForExpense(expenseId: string) {
    setCatPickerIndex(null);
    setCatPickerTarget(expenseId);
    setCatPickerOpen(true);
    setCustomCategory("");
  }

  async function selectCategory(category: string) {
    if (catPickerIndex !== null) {
      // Import preview mode
      const updated = [...csvRows];
      updated[catPickerIndex] = { ...updated[catPickerIndex], category: category as BusinessExpenseCategory };
      setCsvRows(updated);
    } else if (catPickerTarget) {
      // Edit existing expense
      await updateBusinessExpense(catPickerTarget, { category: category as BusinessExpenseCategory });
      // Learn the rule
      const expense = data.businessExpenses.find(e => e.id === catPickerTarget);
      if (expense && category !== "Other") {
        const keyword = expense.description.split(/\s+/)[0]?.toUpperCase();
        if (keyword && keyword.length >= 3) {
          await upsertCategoryRule(keyword, category as BusinessExpenseCategory);
        }
      }
      toast.success("Category updated");
    }
    setCatPickerOpen(false);
  }

  function addCustomCategory() {
    if (!customCategory.trim()) return;
    selectCategory(customCategory.trim());
    setCustomCategory("");
  }

  // Manual add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ date: today.toISOString().slice(0, 10), description: "", category: "Other" as BusinessExpenseCategory, amount: 0, serialNumber: "", notes: "" });

  // Edit dialog
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ category: "Other" as BusinessExpenseCategory, serialNumber: "", notes: "" });

  // Filter expenses for selected year
  const allYearExpenses = useMemo(() =>
    data.businessExpenses
      .filter(e => e.date.startsWith(String(year)))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [data.businessExpenses, year]
  );

  // Monthly stats for the 12 cards
  const monthlyStats = useMemo(() =>
    MONTH_NAMES.map((name, idx) => {
      const monthStr = `${year}-${String(idx + 1).padStart(2, "0")}`;
      const expenses = allYearExpenses.filter(e => e.date.startsWith(monthStr));
      return { name, month: idx + 1, total: expenses.reduce((s, e) => s + e.amount, 0), count: expenses.length };
    }),
    [allYearExpenses, year]
  );

  // Filter by selected month
  const yearExpenses = useMemo(() => {
    if (selectedMonth === "all") return allYearExpenses;
    const monthStr = `${year}-${String(selectedMonth).padStart(2, "0")}`;
    return allYearExpenses.filter(e => e.date.startsWith(monthStr));
  }, [allYearExpenses, selectedMonth, year]);

  const yearTotal = allYearExpenses.reduce((s, e) => s + e.amount, 0);

  // Auto-categorize a description using saved rules
  function autoCategory(description: string): BusinessExpenseCategory {
    const upper = description.toUpperCase();
    for (const rule of data.categoryRules) {
      if (upper.includes(rule.keyword)) return rule.category;
    }
    return "Other";
  }

  // Upload PDF to server for parsing
  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    toast.info("Parsing PDF...");
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const token = await getAuthToken();
      const res = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileData: base64 }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to parse PDF");
      }

      const { transactions, count } = await res.json();
      if (count === 0) {
        toast.error("No transactions found in PDF");
        return;
      }

      const rows: CsvRow[] = (transactions || []).map((t: any) => ({
        date: t.date,
        description: t.description,
        category: autoCategory(t.description) as BusinessExpenseCategory,
        amount: t.amount,
        chaseCategory: "",
        selected: true,
      }));

      toast.success(`Found ${rows.length} transactions`);
      setCsvRows(rows);
      setShowUpload(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse PDF");
    } finally {
      setUploading(false);
    }
  }

  // Handle CSV file upload
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseChaseCSV(text);
      rows.forEach(r => { r.category = autoCategory(r.description); });
      if (rows.length === 0) {
        toast.error("No transactions found. Make sure it's a Chase CSV export.");
      } else {
        toast.success(`Found ${rows.length} transactions`);
        setCsvRows(rows);
        setShowUpload(true);
      }
    };
    reader.readAsText(file);
  }

  // Import selected CSV rows
  async function handleImport() {
    const selected = csvRows.filter(r => r.selected);
    if (selected.length === 0) { toast.error("No transactions selected"); return; }

    // Save category rules for any manually changed categories
    for (const row of selected) {
      if (row.category !== "Other") {
        // Extract keyword from description (first meaningful word or merchant name)
        const keyword = row.description.split(/\s+/)[0]?.toUpperCase();
        if (keyword && keyword.length >= 3) {
          await upsertCategoryRule(keyword, row.category);
        }
      }
    }

    await addBusinessExpenses(selected.map(r => ({
      date: r.date,
      description: r.description,
      category: r.category,
      amount: r.amount,
      serialNumber: "",
      notes: "",
      chaseCategory: r.chaseCategory,
    })));

    toast.success(`Imported ${selected.length} transaction${selected.length !== 1 ? "s" : ""}`);
    setCsvRows([]);
    setShowUpload(false);
  }

  // Manual add
  async function handleManualAdd() {
    if (!addForm.date || !addForm.description || addForm.amount <= 0) {
      toast.error("Fill in date, description, and amount");
      return;
    }
    await addBusinessExpense({
      date: addForm.date,
      description: addForm.description,
      category: addForm.category,
      amount: addForm.amount,
      serialNumber: addForm.serialNumber,
      notes: addForm.notes,
      chaseCategory: "",
    });
    toast.success("Expense added");
    setAddOpen(false);
    setAddForm({ date: today.toISOString().slice(0, 10), description: "", category: "Other", amount: 0, serialNumber: "", notes: "" });
  }

  // Edit save
  async function handleEditSave() {
    if (!editId) return;
    await updateBusinessExpense(editId, { category: editForm.category, serialNumber: editForm.serialNumber, notes: editForm.notes });

    // Learn the category rule
    const expense = data.businessExpenses.find(e => e.id === editId);
    if (expense && editForm.category !== "Other") {
      const keyword = expense.description.split(/\s+/)[0]?.toUpperCase();
      if (keyword && keyword.length >= 3) {
        await upsertCategoryRule(keyword, editForm.category);
      }
    }

    toast.success("Expense updated");
    setEditId(null);
  }

  // Report: group by category (exclude Personal from CPA report)
  const businessExpensesOnly = useMemo(() => yearExpenses.filter(e => e.category !== "Personal"), [yearExpenses]);
  const businessTotal = businessExpensesOnly.reduce((s, e) => s + e.amount, 0);
  const personalTotal = yearExpenses.filter(e => e.category === "Personal").reduce((s, e) => s + e.amount, 0);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, { category: string; total: number; count: number; items: BusinessExpense[] }>();
    businessExpensesOnly.forEach(e => {
      const existing = map.get(e.category) || { category: e.category, total: 0, count: 0, items: [] };
      existing.total += e.amount;
      existing.count++;
      existing.items.push(e);
      map.set(e.category, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [businessExpensesOnly]);

  // Equipment with serial numbers
  const equipmentWithSerials = useMemo(() =>
    yearExpenses.filter(e => e.serialNumber),
    [yearExpenses]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50 print:hidden space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Business Expenses
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {yearExpenses.length} transactions · {formatCurrency(yearTotal)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("list")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                view === "list" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              )}
            >
              Transactions
            </button>
            <button
              onClick={() => setView("report")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                view === "report" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              )}
            >
              CPA Report
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf" onChange={handlePdfUpload} className="hidden" />
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain,application/vnd.ms-excel" onChange={handleFileUpload} className="hidden" />
          <Button size="sm" variant="outline" onClick={() => pdfRef.current?.click()} disabled={uploading} className="gap-2">
            <Upload className="w-4 h-4" /> {uploading ? "Parsing..." : "Upload PDF"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
            <Upload className="w-4 h-4" /> Upload CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Expense
          </Button>
          {view === "report" && (
            <Button size="sm" onClick={() => window.print()} className="gap-2">
              <Download className="w-4 h-4" /> Save as PDF
            </Button>
          )}
        </div>
      </div>

      {/* Year navigator */}
      <div className="flex items-center justify-center gap-4 py-3 print:hidden">
        <button onClick={() => setYear(y => y - 1)} className="p-2 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{year}</h2>
        <button onClick={() => setYear(y => y + 1)} className="p-2 text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Monthly breakdown cards */}
      <div className="px-3 sm:px-6 print:hidden">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
          <button
            onClick={() => setSelectedMonth("all")}
            className={cn(
              "rounded-lg p-2 text-left border transition-colors col-span-3 sm:col-span-4 md:col-span-6 lg:col-span-12",
              selectedMonth === "all" ? "bg-primary/10 border-primary/50" : "bg-card border-border hover:border-primary/30"
            )}
          >
            <p className="text-xs text-muted-foreground font-medium">All Months</p>
            <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(yearTotal)}</p>
            <p className="text-xs text-muted-foreground">{allYearExpenses.length} transactions</p>
          </button>
          {monthlyStats.map(m => {
            const isSelected = selectedMonth === String(m.month);
            return (
              <button
                key={m.name}
                onClick={() => setSelectedMonth(String(m.month))}
                className={cn(
                  "rounded-lg p-2 text-left border transition-colors",
                  isSelected ? "bg-primary/10 border-primary/50" : "bg-card border-border hover:border-primary/30"
                )}
              >
                <p className="text-xs text-muted-foreground font-medium">{m.name.slice(0, 3)}</p>
                <p className={cn("text-sm font-bold tabular-nums", m.total > 0 ? "text-foreground" : "text-muted-foreground/40")}>
                  {m.total > 0 ? formatCurrency(m.total) : "—"}
                </p>
                <p className={cn("text-[10px]", m.count > 0 ? "text-muted-foreground" : "text-muted-foreground/40")}>
                  {m.count > 0 ? `${m.count} txn${m.count !== 1 ? "s" : ""}` : "—"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {/* Print header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">Business Expense Report — {year}</h1>
          <p className="text-sm text-gray-600 mt-1">SDub Media | Generated {new Date().toLocaleDateString()}</p>
        </div>

        {view === "list" ? (
          /* ---- Transaction List ---- */
          <div className="bg-card border border-border rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="text-left px-4 py-2">Description</th>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-left px-3 py-2">Serial #</th>
                    <th className="text-right px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {yearExpenses.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No expenses for {year}. Upload a Chase CSV or add manually.</td></tr>
                  ) : yearExpenses.map(e => (
                    <tr key={e.id} className={`border-b border-border/50 last:border-0 hover:bg-secondary/30 ${e.category === "Personal" ? "opacity-40" : ""}`}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-4 py-2 max-w-[200px] truncate">{e.description}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => openCatPickerForExpense(e.id)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-primary/20 hover:text-primary transition-colors active:bg-primary/30 min-h-[32px]"
                        >
                          {e.category}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(e.amount)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{e.serialNumber || ""}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => { setEditId(e.id); setEditForm({ category: e.category, serialNumber: e.serialNumber, notes: e.notes }); }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => { await deleteBusinessExpense(e.id); toast.success("Deleted"); }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ---- CPA Report View ---- */
          <div className="space-y-6">
            {/* Summary by category */}
            <div className="bg-card border border-border rounded-lg print:border-gray-300">
              <div className="px-4 py-3 border-b border-border print:border-gray-300">
                <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Expenses by Category
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300">
                      <th className="text-left px-4 py-2">Category</th>
                      <th className="text-right px-3 py-2">Transactions</th>
                      <th className="text-right px-4 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryTotals.map(c => (
                      <tr key={c.category} className="border-b border-border/50 print:border-gray-200">
                        <td className="px-4 py-2 font-medium">{c.category}</td>
                        <td className="text-right px-3 py-2">{c.count}</td>
                        <td className="text-right px-4 py-2 font-medium">{formatCurrency(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold border-t-2 border-border print:border-gray-400">
                      <td className="px-4 py-3">BUSINESS TOTAL</td>
                      <td className="text-right px-3 py-3">{businessExpensesOnly.length}</td>
                      <td className="text-right px-4 py-3">{formatCurrency(businessTotal)}</td>
                    </tr>
                    {personalTotal > 0 && (
                      <tr className="text-muted-foreground text-xs">
                        <td className="px-4 py-2">Personal (excluded)</td>
                        <td className="text-right px-3 py-2">{yearExpenses.length - businessExpensesOnly.length}</td>
                        <td className="text-right px-4 py-2">{formatCurrency(personalTotal)}</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Detail by category */}
            {categoryTotals.map(cat => (
              <div key={cat.category} className="bg-card border border-border rounded-lg print:border-gray-300 print:break-inside-avoid">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border print:border-gray-300">
                  <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {cat.category}
                  </h3>
                  <span className="text-sm font-bold text-primary">{formatCurrency(cat.total)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300">
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-4 py-2">Description</th>
                        <th className="text-right px-3 py-2">Amount</th>
                        {cat.items.some(e => e.serialNumber) && <th className="text-left px-3 py-2">Serial #</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {cat.items.map(e => (
                        <tr key={e.id} className="border-b border-border/50 print:border-gray-200 last:border-0">
                          <td className="px-4 py-2 whitespace-nowrap">
                            {new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="px-4 py-2">{e.description}</td>
                          <td className="text-right px-3 py-2 font-medium">{formatCurrency(e.amount)}</td>
                          {cat.items.some(x => x.serialNumber) && <td className="px-3 py-2 text-xs">{e.serialNumber}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* Equipment with Serial Numbers */}
            {equipmentWithSerials.length > 0 && (
              <div className="bg-card border border-border rounded-lg print:border-gray-300 print:break-inside-avoid">
                <div className="px-4 py-3 border-b border-border print:border-gray-300">
                  <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Equipment & Asset Register
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300">
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-4 py-2">Description</th>
                        <th className="text-left px-3 py-2">Serial Number</th>
                        <th className="text-right px-4 py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipmentWithSerials.map(e => (
                        <tr key={e.id} className="border-b border-border/50 print:border-gray-200 last:border-0">
                          <td className="px-4 py-2 whitespace-nowrap">
                            {new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="px-4 py-2">{e.description}</td>
                          <td className="px-3 py-2 font-mono text-xs">{e.serialNumber}</td>
                          <td className="text-right px-4 py-2 font-medium">{formatCurrency(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CSV Upload Preview Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="bg-card border-border text-foreground max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Import Chase Statement — {csvRows.length} transactions found
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Review categories, uncheck personal transactions, then import.</p>
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="px-2 py-2 w-8">
                      <input type="checkbox" checked={csvRows.every(r => r.selected)} onChange={e => setCsvRows(rows => rows.map(r => ({ ...r, selected: e.target.checked })))} />
                    </th>
                    <th className="text-left px-2 py-2">Date</th>
                    <th className="text-left px-2 py-2">Description</th>
                    <th className="text-left px-2 py-2">Category</th>
                    <th className="text-right px-2 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((row, i) => (
                    <tr key={i} className={cn("border-b border-border/30", !row.selected && "opacity-40")}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={row.selected} onChange={e => {
                          const updated = [...csvRows];
                          updated[i] = { ...updated[i], selected: e.target.checked };
                          setCsvRows(updated);
                        }} />
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-xs">{row.date}</td>
                      <td className="px-2 py-1.5 text-xs max-w-[200px] truncate">{row.description}</td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => openCatPicker(i)}
                          className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                            row.category === "Other"
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                              : "bg-primary/20 text-primary border-primary/30"
                          )}
                        >
                          {row.category}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-medium">{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCsvRows([]); setShowUpload(false); }}>Cancel</Button>
            <Button onClick={handleImport}>
              Import {csvRows.filter(r => r.selected).length} Transactions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Amount ($)</Label>
                <Input type="number" min="0" step="0.01" value={addForm.amount || ""} onChange={e => setAddForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className="bg-secondary border-border" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} className="bg-secondary border-border" placeholder="e.g. B&H Photo — Sony A7IV" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value as BusinessExpenseCategory }))} className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Serial Number (optional)</Label>
              <Input value={addForm.serialNumber} onChange={e => setAddForm(f => ({ ...f, serialNumber: e.target.value }))} className="bg-secondary border-border" placeholder="Equipment serial number" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
              <Input value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} className="bg-secondary border-border" placeholder="Any additional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleManualAdd}>Add Expense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editId} onOpenChange={o => !o && setEditId(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Edit Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value as BusinessExpenseCategory }))} className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                onClick={() => setEditForm(f => ({ ...f, category: "Personal" as BusinessExpenseCategory }))}
                className={cn(
                  "w-full mt-2 py-2 rounded-lg border text-sm font-medium transition-colors",
                  editForm.category === "Personal"
                    ? "border-red-500/50 bg-red-500/10 text-red-300"
                    : "border-border text-muted-foreground hover:border-red-500/30 hover:text-red-300"
                )}
              >
                Mark as Not Business Related
              </button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Serial Number (optional)</Label>
              <Input value={editForm.serialNumber} onChange={e => setEditForm(f => ({ ...f, serialNumber: e.target.value }))} className="bg-secondary border-border" placeholder="Equipment serial number" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="bg-secondary border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
            <Button onClick={handleEditSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Picker Dialog */}
      <Dialog open={catPickerOpen} onOpenChange={setCatPickerOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Select Category</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => selectCategory(cat)}
                className={cn(
                  "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                  "border-border text-foreground hover:border-primary hover:bg-primary/10"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Input
              value={customCategory}
              onChange={e => setCustomCategory(e.target.value)}
              placeholder="Custom category..."
              className="bg-secondary border-border text-sm"
              onKeyDown={e => e.key === "Enter" && addCustomCategory()}
            />
            <Button size="sm" onClick={addCustomCategory} disabled={!customCategory.trim()}>
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
