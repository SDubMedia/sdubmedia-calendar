-- Migration: Add photo editor billing calculator support
-- Date: 2026-03-28
-- Purpose: Add editor_billing to projects and partner_split to clients

-- Add editor_billing JSONB column to projects (nullable, most projects won't have it)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS editor_billing jsonb;

-- Add partner_split JSONB column to clients (nullable, only partner clients)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS partner_split jsonb;

-- Set up Coldwell Banker Southern Realty with Showcase Photographers partner split
-- Run this after confirming the correct client ID in production:
-- UPDATE clients
-- SET partner_split = '{"partnerName": "Showcase Photographers", "partnerPercent": 0.45, "adminPercent": 0.45, "marketingPercent": 0.10}'
-- WHERE company = 'Coldwell Banker Southern Realty';
