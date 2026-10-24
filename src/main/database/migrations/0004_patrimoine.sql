-- ============================================================================
-- Migration 0004_patrimoine : socle de la partie patrimoniale.
--   - valeur vénale estimée par bien (socle des calculs de rentabilité)
--   - table depenses : travaux, réparations, assurance PNO, taxe foncière,
--     charges non récupérables... (alimente rentabilité nette et récap 2044)
-- ============================================================================

ALTER TABLE biens ADD COLUMN valeur_venale REAL;
ALTER TABLE biens ADD COLUMN valeur_venale_date TEXT;

CREATE TABLE depenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bien_id      INTEGER REFERENCES biens(id) ON DELETE CASCADE,
  categorie    TEXT    NOT NULL
               CHECK (categorie IN ('travaux','reparations','assurance_pno','taxe_fonciere','charges_non_recuperables','frais_agence','autre')),
  montant      REAL    NOT NULL,
  date_depense TEXT,                                 -- ISO yyyy-mm-dd
  notes        TEXT,
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_depenses_bien ON depenses(bien_id);
CREATE INDEX idx_depenses_date ON depenses(date_depense);
