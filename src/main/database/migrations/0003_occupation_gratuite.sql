-- ============================================================================
-- Migration 0003_occupation_gratuite : statut "occupation gratuite" sur un
-- bail (logement occupé sans loyer, ex : membre de la famille).
-- Les loyers restent NULL ; ce flag exclut le bail des alertes IRL, du
-- suivi des paiements et des quittances.
-- ============================================================================

ALTER TABLE baux ADD COLUMN occupation_gratuite INTEGER NOT NULL DEFAULT 0;
