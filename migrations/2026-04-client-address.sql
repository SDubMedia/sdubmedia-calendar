-- Add address fields to clients
ALTER TABLE clients ADD COLUMN address text NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN city text NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN state text NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN zip text NOT NULL DEFAULT '';
