// ============================================================
// ContractorSummaryPage — 1099 summary for CPA
// Shows total paid per contractor for the year
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { ChevronLeft, ChevronRight, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

interface ContractorSummary {
  id: string;
  name: string;
  businessName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  email: string;
  phone: string;
  taxId: string;
  taxIdType: string;
  totalPaid: number;
  projectCount: number;
  hours: number;
  needs1099: boolean; // paid >= $600
}

export default function ContractorSummaryPage() {
  const { data } = useApp();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());

  const contractors = useMemo((): ContractorSummary[] => {
    const map = new Map<string, ContractorSummary>();

    data.projects
      .filter(p => new Date(p.date + "T00:00:00").getFullYear() === year)
      .forEach(p => {
        const allEntries = [
          ...(p.crew || []).map(e => ({ ...e })),
          ...(p.postProduction || []).map(e => ({ ...e })),
        ];

        const seen = new Set<string>();
        allEntries.forEach(e => {
          const member = data.crewMembers.find(c => c.id === e.crewMemberId);
          if (!member) return;

          const existing = map.get(e.crewMemberId) || {
            id: member.id,
            name: member.name,
            businessName: member.businessName || "",
            address: member.businessAddress || "",
            city: member.businessCity || "",
            state: member.businessState || "",
            zip: member.businessZip || "",
            email: member.email || "",
            phone: member.phone || "",
            taxId: member.taxId || "",
            taxIdType: member.taxIdType || "",
            totalPaid: 0,
            projectCount: 0,
            hours: 0,
            needs1099: false,
          };

          // Calculate pay
          if (e.role === "Photo Editor" && p.editorBilling) {
            existing.totalPaid += p.editorBilling.imageCount * (p.editorBilling.perImageRate ?? 6);
          } else if (e.role !== "Travel") {
            existing.totalPaid += Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0);
          }

          existing.hours += Number(e.hoursWorked ?? 0);
          if (!seen.has(e.crewMemberId)) {
            existing.projectCount++;
            seen.add(e.crewMemberId);
          }

          existing.needs1099 = existing.totalPaid >= 600;
          map.set(e.crewMemberId, existing);
        });
      });

    return Array.from(map.values())
      .filter(c => c.totalPaid > 0)
      .sort((a, b) => b.totalPaid - a.totalPaid);
  }, [data.projects, data.crewMembers, year]);

  const needs1099 = contractors.filter(c => c.needs1099);
  const under600 = contractors.filter(c => !c.needs1099);
  const totalPaidAll = contractors.reduce((s, c) => s + c.totalPaid, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            1099 Contractor Summary
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Year-end contractor pay for tax filing</p>
        </div>
        <Button size="sm" onClick={() => window.print()} className="gap-2">
          <Download className="w-4 h-4" /> Save as PDF
        </Button>
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

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-6">
        {/* Print header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">1099-NEC Contractor Summary — {year}</h1>
          <p className="text-sm text-gray-600 mt-1">{data.organization?.name || "SDub Media"} | Generated {new Date().toLocaleDateString()}</p>
          <p className="text-xs text-gray-500 mt-1">Note: SSN/TIN not stored in system — obtain from contractors separately for filing.</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg p-4 text-center print:border-gray-300">
            <p className="text-2xl font-bold text-foreground">{contractors.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Contractors Paid</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center print:border-gray-300">
            <p className="text-2xl font-bold text-amber-400">{needs1099.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Need 1099</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center print:border-gray-300">
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalPaidAll)}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Paid</p>
          </div>
        </div>

        {/* 1099 Required */}
        {needs1099.length > 0 && (
          <div className="bg-card border border-border rounded-lg print:border-gray-300">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border print:border-gray-300">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                1099-NEC Required (Paid $600+)
              </h3>
            </div>
            <div className="divide-y divide-border/50 print:divide-gray-200">
              {needs1099.map(c => (
                <div key={c.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-foreground">{c.name}</p>
                      {c.businessName && <p className="text-xs text-muted-foreground">{c.businessName}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">{formatCurrency(c.totalPaid)}</p>
                      <p className="text-[10px] text-muted-foreground">{c.projectCount} projects · {c.hours.toFixed(1)} hrs</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      {c.address && <p>{c.address}</p>}
                      {(c.city || c.state) && <p>{[c.city, c.state, c.zip].filter(Boolean).join(", ")}</p>}
                      {!c.address && <p className="text-amber-400/70 print:text-gray-500">No address on file</p>}
                    </div>
                    <div>
                      {c.email && <p>{c.email}</p>}
                      {c.phone && <p>{c.phone}</p>}
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground/50 print:text-gray-400">
                    {c.taxId ? (
                      <span>{c.taxIdType === "ein" ? "EIN" : "SSN"}: <span className="font-mono print:text-gray-800">{c.taxId}</span></span>
                    ) : (
                      <span className="text-amber-400/70 print:text-gray-500">W-9 not on file — SSN/TIN: ___________________________</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Under $600 */}
        {under600.length > 0 && (
          <div className="bg-card border border-border rounded-lg print:border-gray-300">
            <div className="px-4 py-3 border-b border-border print:border-gray-300">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Under $600 (No 1099 Required)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300">
                    <th className="text-left px-4 py-2">Contractor</th>
                    <th className="text-right px-3 py-2">Projects</th>
                    <th className="text-right px-3 py-2">Hours</th>
                    <th className="text-right px-4 py-2">Total Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {under600.map(c => (
                    <tr key={c.id} className="border-b border-border/50 print:border-gray-200">
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="text-right px-3 py-2">{c.projectCount}</td>
                      <td className="text-right px-3 py-2">{c.hours.toFixed(1)}</td>
                      <td className="text-right px-4 py-2 font-medium">{formatCurrency(c.totalPaid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {contractors.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No contractor payments found for {year}.</p>
          </div>
        )}

        {/* Footer note */}
        <div className="text-xs text-muted-foreground print:text-gray-500 space-y-1">
          <p><strong>Filing requirement:</strong> File Form 1099-NEC for each contractor paid $600 or more in non-employee compensation during the tax year.</p>
          <p><strong>Deadline:</strong> 1099-NEC forms must be filed with the IRS and furnished to recipients by January 31 of the following year.</p>
          <p><strong>Note:</strong> Collect W-9 forms from all contractors. Tax IDs can be stored in crew profiles under Staff settings.</p>
        </div>
      </div>
    </div>
  );
}
