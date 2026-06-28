-- Per-bundle client override: in addition to the client-type tag (applies_to),
-- a bundle can be hand-pinned to specific clients. A client sees a bundle if its
-- type matches applies_to OR the client is in this list.
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS client_ids jsonb NOT NULL DEFAULT '[]';
