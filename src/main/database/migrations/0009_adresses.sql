-- ============================================================================
-- Migration 0009_adresses : adresses complètes des locataires
-- (rue, code postal, ville) — utilisées dans les quittances.
-- ============================================================================

ALTER TABLE locataires ADD COLUMN adresse TEXT;
ALTER TABLE locataires ADD COLUMN code_postal TEXT;
ALTER TABLE locataires ADD COLUMN ville TEXT;
