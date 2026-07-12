-- ============================================================
-- Google Drive archiving: the owner connects their own Drive, then can send a
-- delivered gallery to it — a "Slate Galleries" parent folder with a per-
-- property-address subfolder of the photos. drive.file scope = the app only
-- ever sees folders/files it created.
--
-- The refresh token grants Drive access, so it's server-only (AES-256-GCM
-- encrypted, never mapped to the frontend). Only the connected account email is
-- exposed (so the owner sees which account is linked).
-- ============================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_drive_refresh_token text DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_drive_folder_id text DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_drive_email text DEFAULT '';
