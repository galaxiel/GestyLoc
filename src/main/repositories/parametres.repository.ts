import { eq } from 'drizzle-orm'
import { getDb } from '../database/connection'
import { parametres } from '../database/schema'

/** Profil du bailleur utilisé dans les quittances et l'interface. */
export interface BailleurProfile {
  nom_complet: string
  adresse: string // rue
  code_postal: string
  ville: string
}

const CLE_BAILLEUR = 'bailleur'

/**
 * Repository : paramètres de l'application (clé → valeur JSON).
 * Utilisé pour le profil bailleur et les futures préférences.
 */
export const parametresRepository = {
  /** Lit une valeur JSON par clé, null si absente ou illisible. */
  get<T>(cle: string): T | null {
    const row = getDb().select().from(parametres).where(eq(parametres.cle, cle)).get()
    if (!row) return null
    try {
      return JSON.parse(row.valeur) as T
    } catch {
      return null
    }
  },

  /** Crée ou remplace une valeur (upsert). */
  set(cle: string, valeur: unknown): void {
    getDb()
      .insert(parametres)
      .values({ cle, valeur: JSON.stringify(valeur) })
      .onConflictDoUpdate({
        target: parametres.cle,
        set: { valeur: JSON.stringify(valeur), updated_at: new Date().toISOString() }
      })
      .run()
  },

  getBailleur(): BailleurProfile | null {
    return this.get<BailleurProfile>(CLE_BAILLEUR)
  },

  setBailleur(profil: BailleurProfile): void {
    this.set(CLE_BAILLEUR, profil)
  }
}
