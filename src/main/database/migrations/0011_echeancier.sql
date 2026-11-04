-- ============================================================================
-- Migration 0011_echeancier : échéancier réel des loyers.
--   - jour_paiement sur le bail (1-31, défaut 1) : jour du mois où le loyer
--     est attendu (les aides sociales tombent souvent jusqu'au 5-6).
--     Sert de référence au pointage et aux alertes de retard.
--   Le prorata du premier mois (entrée en cours de mois) est CALCULÉ à la
--   volée depuis date_debut_bail (shared/echeancier.ts) — rien à stocker.
-- ============================================================================

ALTER TABLE baux ADD COLUMN jour_paiement INTEGER NOT NULL DEFAULT 1;
