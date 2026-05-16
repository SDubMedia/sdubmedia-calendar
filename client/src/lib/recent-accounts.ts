// Tracks recently used Slate accounts so the login screen can show a
// tap-to-pick card for each. Stored in localStorage; never includes
// passwords. Cards are decorated with org/role after the profile loads.

const STORAGE_KEY = "slate_recent_accounts_v1";
const MAX_ACCOUNTS = 5;

export interface RecentAccount {
  email: string;
  displayName?: string;
  orgName?: string;
  role?: string;
  lastUsedAt: number;
}

function read(): RecentAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(a => a && typeof a.email === "string");
  } catch {
    return [];
  }
}

function write(accounts: RecentAccount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // Storage full or disabled — silently drop. Login still works.
  }
}

export function getRecentAccounts(): RecentAccount[] {
  return read().sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export function rememberAccount(email: string, fields: Partial<Omit<RecentAccount, "email" | "lastUsedAt">> = {}) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const existing = read();
  const idx = existing.findIndex(a => a.email === normalized);
  const merged: RecentAccount = {
    email: normalized,
    displayName: fields.displayName ?? existing[idx]?.displayName,
    orgName: fields.orgName ?? existing[idx]?.orgName,
    role: fields.role ?? existing[idx]?.role,
    lastUsedAt: Date.now(),
  };
  if (idx >= 0) existing[idx] = merged;
  else existing.push(merged);
  const trimmed = existing
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_ACCOUNTS);
  write(trimmed);
}

export function forgetAccount(email: string) {
  const normalized = email.trim().toLowerCase();
  write(read().filter(a => a.email !== normalized));
}
