-- Real-estate galleries are download-only: no cover screen, no favorites
-- walkthrough, no proofing — just the photos and a big Download All. This is a
-- per-gallery flag so event/brand galleries keep their cover + proofing flow.
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS download_only boolean NOT NULL DEFAULT false;
