-- ============================================================================
-- Migration 0012_baux_revisions : historique des révisions de loyer.
-- Une ligne par révision appliquée (IRL ou manuelle) : date, ancien/nouveau
-- loyer, paire IRL utilisée. Prérequis pour comparer le loyer théorique vs
-- réellement appliqué dans le simulateur, et pour tracer les révisions.
-- ============================================================================

CREATE TABLE baux_revisions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  bail_id           INTEGER NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
  date_revision     TEXT    NOT NULL,       -- ISO, date d'application
  ancien_loyer_hc   REAL,
  nouveau_loyer_hc  REAL,
  irl_reference     REAL,
  irl_nouveau       REAL,
  taux              REAL,                   -- % (irl_nouveau/irl_reference - 1)
  created_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_baux_revisions_bail ON baux_revisions(bail_id);
