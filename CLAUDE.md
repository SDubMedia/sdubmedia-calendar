# Project Rules — Slate

These rules are mandatory. Do not deviate without explicit user approval.

## Golden Rules

1. **Run `npx tsc --noEmit` before saying you're done.** Zero type errors allowed.
2. **Run `npx vite build` before pushing.** Build must succeed. Catch what tsc misses.
3. **Search before creating files.** This codebase has 37 pages, 21 API routes, and a massive AppContext. The helper, type, or pattern you need probably exists.
4. **Do not install new dependencies without asking.** State what you want to add and why.
5. **Do not modify files in `client/src/components/ui/`.** Those are managed by shadcn/ui.
6. **Do not rewrite git history.** No rebase, amend, or force-push.
7. **Test before building more.** No new features until the last batch is verified working in production. If 3+ features have shipped untested, stop and test.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4
- **Database**: Supabase (PostgreSQL + Auth + RLS + Storage)
- **API**: Vercel serverless functions (`api/*.ts`)
- **Payments**: Stripe Connect (Standard accounts) + Stripe Checkout
- **Email**: Resend
- **Routing**: Wouter (not React Router)
- **UI Components**: shadcn/ui
- **State**: Single AppContext with in-memory data
- **Package Manager**: pnpm (not npm — delete package-lock.json if it appears)

## Architecture — AppContext Pattern

All data flows through `client/src/contexts/AppContext.tsx`. This is the single source of truth.

**Adding a new entity requires ALL of these:**
1. Type definition in `client/src/lib/types.ts`
2. Add to `AppData` interface in types.ts
3. Add to `emptyData` in AppContext.tsx
4. Add to `emptyData` in `client/src/lib/data.ts`
5. Row converter function (`rowToX`) in AppContext.tsx
6. Supabase fetch query in `loadData` Promise.all
7. Destructured result variable + data mapping line
8. CRUD functions (add, update, delete) as `useCallback`
9. Add methods to the AppContextValue interface
10. Add methods to the context provider value

**Row converter rules:**
- All `rowToX` functions live in AppContext.tsx, NOT in components
- Always provide defaults for JSONB fields: `Array.isArray(r.field) ? r.field : []`
- Always provide defaults for nullable fields: `r.field || null`
- Keep `any` confined to the converter — components should use typed objects

## API Endpoints — Mandatory Pattern

All serverless functions live in `api/*.ts`. Follow this structure:

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Method check
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  // 2. Auth check (authenticated endpoints)
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  // 3. Validate input
  const { field } = req.body;
  if (!field) return res.status(400).json({ error: "Missing field" });

  try {
    // 4. Business logic
    // 5. Return response
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed" });
  }
}
```

**Public endpoints** (no auth): `contract-sign.ts`, `proposal-accept.ts`, `proposal-view.ts` — these use token-based verification instead of Bearer auth.

**Error format**: Always `{ error: string }`.
**Success format**: Always `{ ok: true }` or `{ data: T }`.

## Database — Supabase

- Direct Supabase client — no ORM
- Service role key for API endpoints: `SUPABASE_SERVICE_ROLE_KEY`
- Anon key for frontend: `VITE_SUPABASE_ANON_KEY`

**Every new table MUST have:**
- `org_id text NOT NULL DEFAULT ''` column
- RLS enabled: `ALTER TABLE x ENABLE ROW LEVEL SECURITY`
- Owner policy: `CREATE POLICY "owner_all_x" ON x FOR ALL USING (public.user_role() = 'owner')`
- Migration file in `migrations/` directory

**JSONB columns**: Always provide a default in the CREATE TABLE statement (e.g., `DEFAULT '[]'`). Never assume JSONB columns are non-null in application code.

**Migrations**: Always create a `.sql` file in `migrations/`. Never modify tables by hand without a matching migration file. User runs migrations manually in Supabase SQL Editor.

## Components — Rules

- **Never define React components inside other components.** This causes re-mount on every render (focus loss, state reset). Extract sub-components to the same file above the main export, or to separate files.
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes
- Headings use `fontFamily: "'Space Grotesk', sans-serif"`
- Dark theme is the default — all components must look correct in dark mode first
- Mobile responsive — every page must work at 375px width

## Public Pages — Outside AuthGate

Public pages (no login required) are detected in `App.tsx` before the AuthProvider:

```typescript
if (window.location.pathname.startsWith("/sign/")) { ... }
if (window.location.pathname.startsWith("/proposal/")) { ... }
```

**Adding a new public page:**
1. Add the pathname check in `App.tsx` before the `return` with `AuthProvider`
2. Render inside `ErrorBoundary` + `Suspense` + `Toaster` (no AuthProvider, no AppProvider)
3. Use token-based verification in the API, not Bearer auth

## Stripe — Connected Accounts

Payments flow through the customer's connected Stripe account, NOT the platform account.

- `stripe_account_id` is stored on the `organizations` table
- Checkout sessions pass `{ stripeAccount: org.stripe_account_id }` option
- Platform Stripe key (`STRIPE_SECRET_KEY`) is used to create sessions ON the connected account
- SaaS subscription billing (Basic/Pro) uses the platform account directly

## Feature Flags

`OrgFeatures` on the organization record gates sidebar items and functionality per role. Owner bypasses all flags.

New features that should be plan-gated (Basic vs Pro) should use the existing feature flag system rather than hardcoding access.

## Scope Control

- **One feature per commit.** Don't bundle 3 features into one massive commit. Easier to revert.
- **Test before building more.** If 3+ features have shipped without being tested in production, pause and test.
- **Don't rebuild what exists.** 37 pages, 21 API routes — search first.
- **Don't over-engineer.** If the user asks for a simple fix, don't refactor the surrounding code.
- **Plan big features.** Use EnterPlanMode for any feature that touches 3+ files.

## What NOT To Do

- **Don't define components inside components.** Extract them. We've been burned by this (LineItemEditor focus bug).
- **Don't use `any` in component props.** Keep `any` in row converters only.
- **Don't skip RLS on new tables.** Every table with org data needs row-level security.
- **Don't add console.log for debugging.** Remove debug logs before committing.
- **Don't create new response formats.** API endpoints return `{ error }` or `{ ok/data }`.
- **Don't silently swallow errors.** Every catch block must either log or return the error.
- **Don't use npm.** This project uses pnpm. Delete package-lock.json if it appears.
- **Don't modify middleware or auth without approval.** AuthContext and AuthGate are critical paths.
- **Don't import from `@supabase/supabase-js` in components.** Use AppContext CRUD methods. Only API endpoints and the supabase client file import Supabase directly.
