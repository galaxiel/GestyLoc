-- ============================================================================
-- Migration 0008_nom_bien : champ « nom » distinct de la désignation.
-- La désignation héritée du tableur est souvent une adresse ; le nom est
-- l'identifiant lisible et unique (« Garage renoir n°1 », « Studio Rdc »...).
-- À l'import/migration : nom = désignation (l'utilisateur affinera ensuite).
-- ============================================================================

ALTER TABLE biens ADD COLUMN nom TEXT;
