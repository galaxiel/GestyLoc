// ============================================================================
// Types partagés main (Electron) <-> renderer (React).
// Source unique de vérité : le schéma Drizzle et l'UI consomment ces types.
// Mapping depuis le tableur Excel "Proprietes_Locations" (19 colonnes) vers
// un modèle normalisé à 3 tables : Biens, Locataires, Baux.
// ============================================================================

export type TypeBien =
  | 'Appartement'
  | 'Maison'
  | 'Garage'
  | 'Parking'
  | 'Local'
  | 'Studio'
  | 'Autre'

// ----------------------------------------------------------------------------
// BIENS  (table Biens) — caractéristiques physiques du logement.
// Un bien existe indépendamment de ses locataires successifs.
// ----------------------------------------------------------------------------
export interface Bien {
  id: number
  type_bien: TypeBien
  designation: string // ex: "Appartement T3 centre-ville" / "Garage n°12"
  adresse: string | null
  code_postal: string | null
  ville: string | null
  surface_m2: number | null // Réel (ex: 65.5)
  meuble: boolean // Booléen
  valeur_venale: number | null // estimation (patrimoine)
  valeur_venale_date: string | null
  created_at: string // ISO
  updated_at: string // ISO
}

// ----------------------------------------------------------------------------
// LOCATAIRES  (table Locataires) — identité et contact.
// Un locataire peut occuper plusieurs biens ou se succéder dans le temps.
// ----------------------------------------------------------------------------
export interface Locataire {
  id: number
  nom_complet: string // "Nom du locataire"
  email: string | null
  telephone: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ----------------------------------------------------------------------------
// BAUX  (table Baux) — le contrat lie 1 Bien + 1 Locataire.
// Contient toutes les colonnes financières et IRL du tableur.
// ----------------------------------------------------------------------------
export interface Bail {
  id: number
  // --- Clés étrangères ---
  bien_id: number
  locataire_id: number

  // --- Période du bail ---
  date_debut_bail: string | null // ISO (ex: 2023-09-01)
  date_fin_bail: string | null // ISO (null = bail de durée indéterminée)
  trimestre_reference: string | null // ex: "T3 2023"

  // --- Loyer ---
  loyer_hc: number | null // Loyer Hors Charges (Réel)
  charges: number | null // Charges (Réel)
  loyer_cc: number | null // Loyer Charges Comprises (Réel)
  loyer_metre_carre_hc: number | null // Loyer HC au m² (Réel)
  loyer_annuel_hc: number | null
  loyer_annuel_cc: number | null

  // --- Indexation IRL/ICC (révision annuelle) ---
  irl_reference: number | null // IRL/ICC de référence (Réel)
  irl_nouveau: number | null // IRL nouveau (Réel)
  taux_irl: number | null // Taux IRL en % (Réel)
  nouveau_loyer_hc: number | null // Nouveau loyer après augmentation (Réel)
  date_derniere_revision: string | null // ISO

  // --- Frais ---
  frais_agence: number | null // Réel

  // --- Métadonnées ---
  actif: boolean // true = bail en cours
  occupation_gratuite: boolean // occupé sans loyer (ex : famille)
  created_at: string
  updated_at: string
}

// ----------------------------------------------------------------------------
// Vue agrégée (JOIN des 3 tables) — utilisée par le tableau de bord et le CRUD.
// Reproduit la "ligne" du tableur original, mais en lecture seule.
// ----------------------------------------------------------------------------
export interface BienLocationRow {
  bail: Bail
  bien: Bien
  locataire: Locataire
  // Champ calculé dynamiquement (pas stocké en BDD) :
  jours_avant_fin_bail: number | null // null si pas de date de fin
}

// --- Payloads de création (sans id ni timestamps, générés par la BDD) ---
export interface CreateBienInput {
  type_bien: TypeBien
  designation: string
  adresse?: string | null
  code_postal?: string | null
  ville?: string | null
  surface_m2?: number | null
  meuble?: boolean
  valeur_venale?: number | null
  valeur_venale_date?: string | null
}

export interface CreateLocataireInput {
  nom_complet: string
  email?: string | null
  telephone?: string | null
  notes?: string | null
}

export interface CreateBailInput {
  bien_id: number
  locataire_id: number
  date_debut_bail?: string | null
  date_fin_bail?: string | null
  trimestre_reference?: string | null
  loyer_hc?: number | null
  charges?: number | null
  loyer_cc?: number | null
  loyer_metre_carre_hc?: number | null
  loyer_annuel_hc?: number | null
  loyer_annuel_cc?: number | null
  irl_reference?: number | null
  irl_nouveau?: number | null
  taux_irl?: number | null
  nouveau_loyer_hc?: number | null
  date_derniere_revision?: string | null
  frais_agence?: number | null
  actif?: boolean
  occupation_gratuite?: boolean
}

// Update payloads = mêmes champs mais tous optionnels.
export type UpdateBienInput = Partial<CreateBienInput> & { id: number }
export type UpdateLocataireInput = Partial<CreateLocataireInput> & { id: number }
export type UpdateBailInput = Partial<CreateBailInput> & { id: number }

// ----------------------------------------------------------------------------
// PAIEMENTS (suivi loyers payés / en retard / impayés)
// ----------------------------------------------------------------------------
export type StatutPaiement = 'paye' | 'partiel' | 'retard' | 'impaye'

export interface Paiement {
  bail_id: number
  periode: string // 'yyyy-mm'
  montant_paye: number
  date_paiement: string | null
  statut: StatutPaiement
  mode_paiement: string | null
  reference: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CreatePaiementInput {
  bail_id: number
  periode: string // 'yyyy-mm'
  montant_paye: number
  date_paiement?: string | null
  statut: StatutPaiement
  mode_paiement?: string | null
  reference?: string | null
  notes?: string | null
}

export type UpdatePaiementInput = Partial<Omit<CreatePaiementInput, 'bail_id' | 'periode'>>

// ----------------------------------------------------------------------------
// DOCUMENTS (pièces jointes : baux, états des lieux...)
// ----------------------------------------------------------------------------
export type TypeDocument =
  | 'bail'
  | 'etat_des_lieux_entree'
  | 'etat_des_lieux_sortie'
  | 'assurance'
  | 'autre'

export interface DocumentRow {
  id: number
  bail_id: number | null
  bien_id: number | null
  nom_original: string
  chemin_stockage: string
  type_document: TypeDocument
  taille_octets: number | null
  mime_type: string | null
  created_at: string
  updated_at: string
}

// ----------------------------------------------------------------------------
// ALERTES (dashboard) — calculées côté main, consommées par React
// ----------------------------------------------------------------------------
export interface Alerte {
  type: 'fin_bail' | 'revision_irl' | 'impaye'
  severite: 'info' | 'warning' | 'urgent'
  message: string
  bail_id: number
}

// ----------------------------------------------------------------------------
// DÉPENSES (travaux, PNO, taxe foncière...) — module patrimonial
// ----------------------------------------------------------------------------
export type CategorieDepense =
  | 'travaux'
  | 'reparations'
  | 'assurance_pno'
  | 'taxe_fonciere'
  | 'charges_non_recuperables'
  | 'frais_agence'
  | 'autre'

export interface Depense {
  id: number
  bien_id: number | null
  categorie: CategorieDepense
  montant: number
  date_depense: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CreateDepenseInput {
  bien_id?: number | null
  categorie: CategorieDepense
  montant: number
  date_depense?: string | null
  notes?: string | null
}
