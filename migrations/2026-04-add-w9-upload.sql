-- Add W-9 document storage path to crew_members
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS w9_url text DEFAULT '';

-- Create storage bucket for W-9 documents (run in Supabase Dashboard > Storage)
-- Bucket name: w9-documents
-- Public: NO (PRIVATE — contains SSNs and sensitive PII)
-- Access via signed URLs only (60-second expiration)
--
-- Storage RLS policies (run in SQL Editor after creating bucket):

-- Allow authenticated users to upload W-9s
CREATE POLICY "Authenticated users can upload w9s"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'w9-documents');

-- Allow authenticated users to read w9s (signed URLs still required)
CREATE POLICY "Authenticated users can read w9s"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'w9-documents');

-- Allow authenticated users to update (overwrite) w9s
CREATE POLICY "Authenticated users can update w9s"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'w9-documents');

-- Allow authenticated users to delete w9s
CREATE POLICY "Authenticated users can delete w9s"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'w9-documents');
