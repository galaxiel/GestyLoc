-- ============================================================================
-- Migration 0013_assurance : traçage des demandes d'attestation d'assurance.
-- Date de la dernière demande envoyée au locataire (email pré-rempli de la
-- fiche bail) : permet de ne PAS relancer si une demande a déjà été faite
-- dans l'année (l'alerte anniversaire ne repart pas pour rien).
-- ============================================================================

ALTER TABLE baux ADD COLUMN assurance_demandee_le TEXT; -- ISO, null si jamais
