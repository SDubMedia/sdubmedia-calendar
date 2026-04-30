-- Galleries are owner-only. Partner role no longer reads or writes any
-- delivery surface. Clients keep their own gallery access via the existing
-- client policies + share tokens.

DROP POLICY IF EXISTS "partner_all_deliveries" ON deliveries;
DROP POLICY IF EXISTS "partner_all_delivery_files" ON delivery_files;
DROP POLICY IF EXISTS "partner_all_delivery_selections" ON delivery_selections;
DROP POLICY IF EXISTS "partner_all_delivery_collections" ON public.delivery_collections;
DROP POLICY IF EXISTS "partner_read_gallery_visitors" ON public.gallery_visitors;
