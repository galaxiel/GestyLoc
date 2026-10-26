-- ============================================================================
-- Migration 0010_quittance_reference : numéro de référence unique sur chaque
-- quittance (format QUITT-{AAAA}{MM}-{ID_BAIL}, déterministe grâce à la clé
-- composite bail_id + periode). Rétro-appliqué aux quittances existantes.
-- ============================================================================

ALTER TABLE quittances ADD COLUMN reference_number TEXT;

CREATE UNIQUE INDEX idx_quittances_reference ON quittances(reference_number);

UPDATE quittances
SET reference_number = 'QUITT-' || replace(periode, '-', '') || '-' || printf('%03d', bail_id)
WHERE reference_number IS NULL;
