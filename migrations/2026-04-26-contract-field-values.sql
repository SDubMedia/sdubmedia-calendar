-- Per-contract bracket-field values, keyed by the placeholder text.
-- Lets the WYSIWYG editor link chips with the same placeholder so filling
-- one fills all of them, and gives admin/export a clean queryable shape
-- separate from the rendered HTML.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS field_values JSONB NOT NULL DEFAULT '{}'::jsonb;

-- No new RLS needed — the existing policies on contracts already gate
-- the column with the rest of the row.
