-- ============================================================================
-- Migration 0001_init : schéma initial normalisé (Biens, Locataires, Baux,
-- Paiements, Documents).
-- Mapping depuis le tableur Excel "Proprietes_Locations" (19 colonnes).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table Biens (caractéristiques physiques)
-- ----------------------------------------------------------------------------
CREATE TABLE biens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type_bien     TEXT    NOT NULL,             -- Appartement|Maison|Garage|...
  designation   TEXT    NOT NULL,
  adresse       TEXT,
  code_postal   TEXT,
  ville         TEXT,
  surface_m2    REAL,                          -- Réel (ex: 65.5)
  meuble        INTEGER NOT NULL DEFAULT 0,    -- Booléen (0/1)
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table Locataires (identité + contact)
-- ----------------------------------------------------------------------------
CREATE TABLE locataires (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nom_complet  TEXT    NOT NULL,              -- "Nom du locataire" (tableur)
  email        TEXT,
  telephone    TEXT,
  notes        TEXT,
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Table Baux (contrat = 1 Bien + 1 Locataire + données financières + IRL)
-- Toutes les colonnes financières du tableur vivent ici.
-- ----------------------------------------------------------------------------
CREATE TABLE baux (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  bien_id                 INTEGER NOT NULL REFERENCES biens(id)        ON DELETE CASCADE,
  locataire_id            INTEGER NOT NULL REFERENCES locataires(id)   ON DELETE CASCADE,

  -- Période
  date_debut_bail         TEXT,    -- ISO yyyy-mm-dd
  date_fin_bail           TEXT,    -- null = bail indéterminé
  trimestre_reference     TEXT,    -- ex: "T3 2023"

  -- Loyer
  loyer_hc                REAL,    -- Loyer Hors Charges
  charges                 REAL,
  loyer_cc                REAL,    -- Loyer Charges Comprises
  loyer_metre_carre_hc    REAL,    -- Loyer HC au m²
  loyer_annuel_hc         REAL,
  loyer_annuel_cc         REAL,

  -- Indexation IRL/ICC (révision annuelle)
  irl_reference           REAL,    -- IRL/ICC de référence
  irl_nouveau             REAL,    -- IRL nouveau
  taux_irl                REAL,    -- Taux IRL (%)
  nouveau_loyer_hc        REAL,    -- Nouveau loyer après augmentation HC/CC
  date_derniere_revision  TEXT,    -- ISO

  -- Frais
  frais_agence            REAL,

  -- État
  actif                   INTEGER NOT NULL DEFAULT 1,   -- bail en cours ?

  created_at              TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index pour accélérer les recherches par bien / locataire / bail actif.
CREATE INDEX idx_baux_bien_id      ON baux(bien_id);
CREATE INDEX idx_baux_locataire_id ON baux(locataire_id);
CREATE INDEX idx_baux_actif        ON baux(actif);
CREATE INDEX idx_baux_fin_bail     ON baux(date_fin_bail);

-- ----------------------------------------------------------------------------
-- Table Paiements (suivi loyers payés / retard / impayés)
-- Clé primaire composite : (bail_id, periode) => impossible de pointerer 2x
-- le même mois pour un même bail.
-- ----------------------------------------------------------------------------
CREATE TABLE paiements (
  bail_id        INTEGER NOT NULL REFERENCES baux(id) ON DELETE CASCADE,
  periode        TEXT    NOT NULL,             -- 'yyyy-mm'
  montant_paye   REAL    NOT NULL,
  date_paiement  TEXT,
  statut         TEXT    NOT NULL DEFAULT 'impaye'
                 CHECK (statut IN ('paye','partiel','retard','impaye')),
  mode_paiement  TEXT,
  reference      TEXT,
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (bail_id, periode)
);

CREATE INDEX idx_paiements_statut ON paiements(statut);

-- ----------------------------------------------------------------------------
-- Table Documents (pièces jointes : baux, états des lieux, assurances...)
-- Le fichier est stocké sur disque dans AppData ; seul le chemin est en BDD.
-- ----------------------------------------------------------------------------
CREATE TABLE documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  bail_id         INTEGER REFERENCES baux(id)       ON DELETE CASCADE,
  bien_id         INTEGER REFERENCES biens(id)      ON DELETE CASCADE,
  nom_original    TEXT    NOT NULL,
  chemin_stockage TEXT    NOT NULL,             -- chemin absolu AppData
  type_document   TEXT    NOT NULL DEFAULT 'autre'
                  CHECK (type_document IN ('bail','etat_des_lieux_entree','etat_des_lieux_sortie','assurance','autre')),
  taille_octets   INTEGER,
  mime_type       TEXT,
  created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_bail_id ON documents(bail_id);
CREATE INDEX idx_documents_bien_id ON documents(bien_id);
