// ============================================================
// ClientsPage — Client directory
// Design: Dark Cinematic Studio
// ============================================================

import { useState } from "react";
import { Plus, Building2, Phone, Mail, Edit3, Trash2, Calendar, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import type { Client } from "@/lib/types";
import { toast } from "sonner";
import ClientProfileSheet from "@/components/ClientProfileSheet";

export default function ClientsPage() {
  const { data, deleteClient } = useApp();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  const openAdd = () => {
    setEditingClient(null);
    setSheetOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setSheetOpen(true);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteClient(deleteTarget.id);
      toast.success("Client deleted");
      setDeleteTarget(null);
    }
  };

  const getProjectCount = (clientId: string) =>
    data.projects.filter((p) => p.clientId === clientId).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.clients.length} client{data.clients.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add Client
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {data.clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Building2 className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">No clients yet. Add your first client.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {data.clients.map((client) => (
              <div key={client.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 hover:border-border/80 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => openEdit(client)}
                    className="font-medium text-foreground truncate hover:text-primary cursor-pointer text-left block w-full transition-colors"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {client.company}
                  </button>
                  <div className="text-sm text-muted-foreground">{client.contactName}</div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                    {client.phone && (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone}</span>
                    )}
                    {client.email && (
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{client.email}</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                    <Calendar className="w-3 h-3" />
                    {getProjectCount(client.id)} projects
                  </div>
                  <div className="text-xs text-primary flex items-center gap-1 justify-end">
                    <DollarSign className="w-3 h-3" />
                    {client.billingModel === "per_project"
                      ? `$${Number(client.perProjectRate).toFixed(0)}/project`
                      : `$${Number(client.billingRatePerHour).toFixed(0)}/hr`
                    }
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(client)}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(client)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ClientProfileSheet client={editingClient} open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete "{deleteTarget?.company}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
