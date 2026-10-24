-- ============================================================================
-- Migration 0002_parametres : table clé→valeur pour les paramètres de l'app
-- (profil bailleur, préférences...). Valeur en JSON texte.
-- ============================================================================

CREATE TABLE parametres (
  cle        TEXT PRIMARY KEY,
  valeur     TEXT    NOT NULL,            -- JSON libre
  updated_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
