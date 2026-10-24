-- ============================================================================
-- Migration 0006_quittances : historique des quittances générées
-- (évite les doublons et les oublis ; sert de trace d'envoi)
-- ============================================================================

CREATE TABLE quittances (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bail_id      INTEGER NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
  periode      TEXT    NOT NULL,            -- 'yyyy-mm'
  nom_fichier  TEXT    NOT NULL,
  chemin       TEXT,
  genere_le    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Une seule trace par (bail, période) : une régénération met à jour la ligne.
CREATE UNIQUE INDEX idx_quittances_bail_periode ON quittances(bail_id, periode);
