-- Scope each service bundle (category) to a client type, so the right bundle
-- shows when booking/invoicing that client. 'any' = shown for every client.
-- Values: 'any' | 'real_estate' | 'wedding' | 'photography'.
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'any';
