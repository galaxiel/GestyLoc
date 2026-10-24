// ============================================================================
// Schéma de la base de données (Drizzle ORM).
// Source de vérité : `npm run db:generate` produit les migrations SQL
// versionnées dans drizzle/*. Ne pas éditer les .sql à la main.
// ============================================================================

import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Helper : timestamps automatiques.
// created_at = maintenant à l'insert ; updated_at = maintenant à chaque modif.
const timestamps = {
  created_at: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
}

// ----------------------------------------------------------------------------
// Table Biens
// ----------------------------------------------------------------------------
export const biens = sqliteTable('biens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type_bien: text('type_bien').notNull(), // TypeBien (voir shared/types.ts)
  designation: text('designation').notNull(),
  adresse: text('adresse'),
  code_postal: text('code_postal'),
  ville: text('ville'),
  surface_m2: real('surface_m2'), // Réel
  meuble: integer('meuble', { mode: 'boolean' }).notNull().default(false),
  ...timestamps
})

// ----------------------------------------------------------------------------
// Table Locataires
// ----------------------------------------------------------------------------
export const locataires = sqliteTable('locataires', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nom_complet: text('nom_complet').notNull(),
  email: text('email'),
  telephone: text('telephone'),
  notes: text('notes'),
  ...timestamps
})

// ----------------------------------------------------------------------------
// Table Baux — relie 1 Bien à 1 Locataire (avec données financières + IRL)
// ----------------------------------------------------------------------------
export const baux = sqliteTable('baux', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Clés étrangères (cascade au delete : supprimer un bien efface ses baux).
  bien_id: integer('bien_id')
    .notNull()
    .references(() => biens.id, { onDelete: 'cascade' }),
  locataire_id: integer('locataire_id')
    .notNull()
    .references(() => locataires.id, { onDelete: 'cascade' }),

  // Période
  date_debut_bail: text('date_debut_bail'), // ISO yyyy-mm-dd
  date_fin_bail: text('date_fin_bail'), // null = indéterminée
  trimestre_reference: text('trimestre_reference'),

  // Loyer
  loyer_hc: real('loyer_hc'),
  charges: real('charges'),
  loyer_cc: real('loyer_cc'),
  loyer_metre_carre_hc: real('loyer_metre_carre_hc'),
  loyer_annuel_hc: real('loyer_annuel_hc'),
  loyer_annuel_cc: real('loyer_annuel_cc'),

  // Indexation IRL/ICC
  irl_reference: real('irl_reference'),
  irl_nouveau: real('irl_nouveau'),
  taux_irl: real('taux_irl'),
  nouveau_loyer_hc: real('nouveau_loyer_hc'),
  date_derniere_revision: text('date_derniere_revision'),

  // Frais
  frais_agence: real('frais_agence'),

  // État
  actif: integer('actif', { mode: 'boolean' }).notNull().default(true),

  ...timestamps
})

// ----------------------------------------------------------------------------
// Table Paiements (étape : suivi des loyers payés/retard/impayés)
// Un paiement = 1 bail + 1 mois. Pas de double pointage possible.
// ----------------------------------------------------------------------------
export const paiements = sqliteTable(
  'paiements',
  {
    bail_id: integer('bail_id')
      .notNull()
      .references(() => baux.id, { onDelete: 'cascade' }),
    periode: text('periode').notNull(), // 'yyyy-mm' (mois concerné)
    montant_paye: real('montant_paye').notNull(),
    date_paiement: text('date_paiement'), // ISO du règlement effectif
    statut: text('statut', {
      enum: ['paye', 'partiel', 'retard', 'impaye']
    })
      .notNull()
      .default('impaye'),
    mode_paiement: text('mode_paiement'), // virement, chèque, espèces...
    reference: text('reference'), // n° de quittance / de chèque
    notes: text('notes'),
    ...timestamps
  },
  (table) => [primaryKey({ columns: [table.bail_id, table.periode] })]
)

// ----------------------------------------------------------------------------
// Table Documents (pièces jointes baux/états des lieux)
// Le fichier est stocké sur disque ; seul le chemin est en BDD.
// ----------------------------------------------------------------------------
export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bail_id: integer('bail_id').references(() => baux.id, { onDelete: 'cascade' }),
  bien_id: integer('bien_id').references(() => biens.id, { onDelete: 'cascade' }),
  nom_original: text('nom_original').notNull(), // nom du fichier importé
  chemin_stockage: text('chemin_stockage').notNull(), // chemin absolu AppData
  type_document: text('type_document', {
    enum: ['bail', 'etat_des_lieux_entree', 'etat_des_lieux_sortie', 'assurance', 'autre']
  })
    .notNull()
    .default('autre'),
  taille_octets: integer('taille_octets'),
  mime_type: text('mime_type'),
  ...timestamps
})

// ----------------------------------------------------------------------------
// Table Paramètres (clé → valeur JSON : profil bailleur, préférences...)
// ----------------------------------------------------------------------------
export const parametres = sqliteTable('parametres', {
  cle: text('cle').primaryKey(),
  valeur: text('valeur').notNull(), // JSON libre
  updated_at: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
})
