// ============================================================
// UsersPage — Owner-only user management
// Create accounts, assign roles, attach clients
// ============================================================

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import type { UserRole } from "@/lib/types";
import { Plus, Trash2, X, Shield, Users, Eye, Users2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/supabase";

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  client: "Client",
  partner: "Partner",
  staff: "Staff",
};

const ROLE_COLORS: Record<UserRole, string> = {
  owner: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  client: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  partner: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  staff: "bg-green-500/20 text-green-300 border-green-500/30",
};

export default function UsersPage() {
  const { allProfiles, refreshProfiles, createUser, updateUserProfile, deleteUser, profile: myProfile } = useAuth();
  const { data } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "client" as UserRole, clientIds: [] as string[], crewMemberId: "" });
  const [sendInvite, setSendInvite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editClientIds, setEditClientIds] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<UserRole>("client");
  const [editCrewMemberId, setEditCrewMemberId] = useState<string>("");
  const [editEmail, setEditEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [editForceChange, setEditForceChange] = useState(true);
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => { refreshProfiles(); }, [refreshProfiles]);

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.name) {
      toast.error("Please fill in all fields");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if ((form.role === "client" || form.role === "partner") && form.clientIds.length === 0) {
      toast.error("Please attach at least one client");
      return;
    }
    if (form.role === "staff" && !form.crewMemberId) {
      toast.error("Please select a crew member for this staff user");
      return;
    }
    setSubmitting(true);
    try {
      const newUserId = await createUser(form.email, form.password, form.name, form.role, form.clientIds, form.crewMemberId);
      toast.success(`User "${form.name}" created`);

      if (sendInvite) {
        try {
          const token = await getAuthToken();
          const res = await fetch("/api/invite-user", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ userId: newUserId, tempPassword: form.password }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Failed" }));
            throw new Error(err.error || "Failed to send invite");
          }
          toast.success(`Invite email sent to ${form.email}`);
        } catch (inviteErr: any) {
          toast.error(`User created but invite failed: ${inviteErr.message}`);
        }
      }

      setForm({ email: "", password: "", name: "", role: "client", clientIds: [], crewMemberId: "" });
      setSendInvite(false);
      setShowForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUser(id);
      toast.success("User removed");
      setConfirmDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    }
  };

  const toggleClient = (clientId: string) => {
    setForm(f => ({
      ...f,
      clientIds: f.clientIds.includes(clientId)
        ? f.clientIds.filter(id => id !== clientId)
        : [...f.clientIds, clientId],
    }));
  };

  const openEdit = (u: typeof allProfiles[0]) => {
    setEditingUser(u.id);
    setEditClientIds(u.clientIds);
    setEditRole(u.role);
    setEditCrewMemberId(u.crewMemberId || "");
    setEditEmail(u.email);
    setEditPassword("");
    setEditForceChange(true);
  };

  const handleUpdateEmail = async (userId: string, originalEmail: string) => {
    if (!editEmail || editEmail === originalEmail) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) {
      toast.error("Invalid email format");
      return;
    }
    setSavingEmail(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ userId, newEmail: editEmail }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to update email");
      }
      await refreshProfiles();
      toast.success("Email updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update email");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!editPassword || editPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setResettingPassword(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ userId, newPassword: editPassword, forceChange: editForceChange }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to reset password");
      }
      toast.success("Password reset successfully");
      setEditPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setResettingPassword(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    try {
      await updateUserProfile(editingUser, { role: editRole, clientIds: editClientIds, crewMemberId: editCrewMemberId });
      toast.success("User updated");
      setEditingUser(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update user");
    }
  };

  const toggleEditClient = (clientId: string) => {
    setEditClientIds(prev =>
      prev.includes(clientId) ? prev.filter(id => id !== clientId) : [...prev, clientId]
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Manage Users
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create accounts and assign roles</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Create User</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {/* Create User Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Create New User
              </h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min 6 characters"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="owner">Owner — Full access</option>
                  <option value="partner">Partner — Financial view for attached clients</option>
                  <option value="client">Client — View-only for their own data</option>
                  <option value="staff">Staff — View own schedule & pay</option>
                </select>
              </div>
            </div>

            {(form.role === "staff" || form.role === "owner" || form.role === "partner") && (
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                  {form.role === "staff" ? "Assign to Crew Member" : "Link to Crew Profile (for mileage, etc.)"}
                </label>
                <select
                  value={form.crewMemberId}
                  onChange={e => setForm(f => ({ ...f, crewMemberId: e.target.value }))}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">{form.role === "staff" ? "Select crew member..." : "None"}</option>
                  {data.crewMembers.map(cm => (
                    <option key={cm.id} value={cm.id}>{cm.name}</option>
                  ))}
                </select>
              </div>
            )}

            {(form.role === "client" || form.role === "partner") && (
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">Attach to Client(s)</label>
                <div className="flex flex-wrap gap-2">
                  {data.clients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => toggleClient(c.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs border transition-colors",
                        form.clientIds.includes(c.id)
                          ? "bg-primary/20 border-primary/50 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {c.company}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={e => setSendInvite(e.target.checked)}
                  className="rounded border-border"
                />
                Send invite email with login details
              </label>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        )}

        {/* User List */}
        <div className="space-y-3">
          {allProfiles.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No users yet</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Create the first user account to get started.</p>
            </div>
          ) : (
            allProfiles.map(u => {
              const attachedClients = data.clients.filter(c => u.clientIds.includes(c.id));
              const isMe = u.id === myProfile?.id;
              return (
                <div key={u.id} className="bg-card border border-border rounded-lg p-4 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    {u.role === "owner" ? <Shield className="w-5 h-5 text-amber-400" /> :
                     u.role === "partner" ? <Eye className="w-5 h-5 text-purple-400" /> :
                     u.role === "staff" ? <Users2 className="w-5 h-5 text-green-400" /> :
                     <Users className="w-5 h-5 text-blue-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-sm font-semibold text-foreground hover:text-primary cursor-pointer"
                      >
                        {u.name}
                      </button>
                      {isMe && <span className="text-[10px] text-muted-foreground">(you)</span>}
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", ROLE_COLORS[u.role])}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    {u.crewMemberId && editingUser !== u.id && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-300">
                          {data.crewMembers.find(cm => cm.id === u.crewMemberId)?.name ?? "Unknown crew member"}
                        </span>
                      </div>
                    )}
                    {attachedClients.length > 0 && editingUser !== u.id && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {attachedClients.map(c => (
                          <span key={c.id} className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                            {c.company}
                          </span>
                        ))}
                      </div>
                    )}
                    {editingUser === u.id && (
                      <div className="mt-3 p-3 bg-secondary/50 rounded-lg space-y-3 border border-border">
                        <div>
                          <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Role</label>
                          <select
                            value={editRole}
                            onChange={e => setEditRole(e.target.value as UserRole)}
                            className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
                          >
                            <option value="owner">Owner</option>
                            <option value="partner">Partner</option>
                            <option value="client">Client</option>
                            <option value="staff">Staff</option>
                          </select>
                        </div>
                        {(editRole === "staff" || editRole === "owner" || editRole === "partner") && (
                          <div>
                            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                              {editRole === "staff" ? "Assigned Crew Member" : "Linked Crew Profile"}
                            </label>
                            <select
                              value={editCrewMemberId}
                              onChange={e => setEditCrewMemberId(e.target.value)}
                              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
                            >
                              <option value="">{editRole === "staff" ? "Select crew member..." : "None"}</option>
                              {data.crewMembers.map(cm => (
                                <option key={cm.id} value={cm.id}>{cm.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {(editRole === "client" || editRole === "partner") && (
                          <div>
                            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-2">Attached Clients</label>
                            <div className="flex flex-wrap gap-2">
                              {data.clients.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => toggleEditClient(c.id)}
                                  className={cn(
                                    "px-2.5 py-1 rounded text-xs border transition-colors",
                                    editClientIds.includes(c.id)
                                      ? "bg-primary/20 border-primary/50 text-primary"
                                      : "border-border text-muted-foreground hover:border-primary/30"
                                  )}
                                >
                                  {c.company}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Email */}
                        <div className="border-t border-border pt-3">
                          <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Email</label>
                          <div className="flex gap-2 items-end">
                            <input
                              type="email"
                              value={editEmail}
                              onChange={e => setEditEmail(e.target.value)}
                              className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
                            />
                            <button
                              onClick={() => handleUpdateEmail(u.id, u.email)}
                              disabled={savingEmail || editEmail === u.email}
                              className="px-3 py-1.5 rounded text-xs bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50"
                            >
                              {savingEmail ? "Saving..." : "Update"}
                            </button>
                          </div>
                        </div>

                        {/* Password Reset */}
                        <div className="border-t border-border pt-3">
                          <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1 flex items-center gap-1">
                            <KeyRound className="w-3 h-3" /> Reset Password
                          </label>
                          <div className="flex gap-2 items-end">
                            <input
                              type="password"
                              value={editPassword}
                              onChange={e => setEditPassword(e.target.value)}
                              placeholder="New password (min 6 chars)"
                              className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
                            />
                            <button
                              onClick={() => handleResetPassword(u.id)}
                              disabled={resettingPassword || !editPassword}
                              className="px-3 py-1.5 rounded text-xs bg-destructive/20 text-destructive hover:bg-destructive/30 disabled:opacity-50"
                            >
                              {resettingPassword ? "Resetting..." : "Reset"}
                            </button>
                          </div>
                          <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editForceChange}
                              onChange={e => setEditForceChange(e.target.checked)}
                              className="rounded border-border"
                            />
                            Force password change on next login
                          </label>
                        </div>

                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setEditingUser(null)}
                            className="text-xs px-3 py-1.5 rounded bg-secondary text-muted-foreground hover:text-foreground"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {!isMe && (
                    <div className="shrink-0">
                      {confirmDelete === u.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(u.id)}
                          className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
