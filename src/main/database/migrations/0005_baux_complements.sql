-- ============================================================================
-- Migration 0005_baux_complements : compléments réglementaires et financiers.
--   - DPE (classe A->G) sur le bien (obligation de location en France)
--   - dépôt de garantie sur le bail (montant versé, à suivre pour restitution)
--   - type de charges (forfaitaires vs provisionnelles avec régularisation)
-- ============================================================================

ALTER TABLE biens ADD COLUMN dpe TEXT; -- A|B|C|D|E|F|G, null si inconnu
ALTER TABLE baux ADD COLUMN depot_garantie REAL;
ALTER TABLE baux ADD COLUMN type_charges TEXT; -- 'forfaitaires' | 'provisionnelles'
