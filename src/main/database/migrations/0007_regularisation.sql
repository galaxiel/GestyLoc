-- ============================================================================
-- Migration 0007_regularisation : charges réelles par bail et par année,
-- pour la régularisation annuelle (provisions versées vs charges réelles).
-- ============================================================================

CREATE TABLE regularisations_charges (
  bail_id         INTEGER NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
  annee           INTEGER NOT NULL,
  charges_reelles REAL    NOT NULL,
  regularise_le   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bail_id, annee)
);
