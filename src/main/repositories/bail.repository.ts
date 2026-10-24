import { eq, desc } from 'drizzle-orm'
import { differenceInCalendarDays, parseISO, isValid } from 'date-fns'
import { getDb } from '../database/connection'
import { baux, biens, locataires } from '../database/schema'
import type { Bail, CreateBailInput, BienLocationRow } from '@shared/types'

/**
 * Calcule le nombre de jours restants avant la fin d'un bail.
 * Retourne null si pas de date de fin (bail indéterminé) ou date invalide.
 */
function computeJoursAvantFin(dateFin: string | null): number | null {
  if (!dateFin) return null
  const parsed = parseISO(dateFin)
  if (!isValid(parsed)) return null
  return differenceInCalendarDays(parsed, new Date())
}

/**
 * Repository : accès aux données "Baux" (le contrat de location).
 * Le `listWithRelations()` reproduit la ligne du tableur original :
 * bail + bien + locataire agrégés, + jours_avant_fin_bail calculé.
 */
export const bailRepository = {
  list(): Bail[] {
    return getDb().select().from(baux).all() as Bail[]
  },

  getById(id: number): Bail | undefined {
    return getDb().select().from(baux).where(eq(baux.id, id)).get() as Bail | undefined
  },

  /** Vue agrégée = "Proprietes_Locations" du tableur (JOIN des 3 tables). */
  listWithRelations(): BienLocationRow[] {
    const rows = getDb()
      .select()
      .from(baux)
      .innerJoin(biens, eq(baux.bien_id, biens.id))
      .innerJoin(locataires, eq(baux.locataire_id, locataires.id))
      .orderBy(desc(baux.actif), biens.designation)
      .all()

    return rows.map((row) => ({
      bail: row.baux as Bail,
      bien: row.biens as BienLocationRow['bien'],
      locataire: row.locataires as BienLocationRow['locataire'],
      jours_avant_fin_bail: computeJoursAvantFin(row.baux.date_fin_bail)
    }))
  },

  create(input: CreateBailInput): Bail {
    return getDb().insert(baux).values(input).returning().get() as Bail
  },

  update(id: number, input: Partial<CreateBailInput>): Bail | undefined {
    const fields = input
    return getDb()
      .update(baux)
      .set({ ...fields, updated_at: new Date().toISOString() })
      .where(eq(baux.id, id))
      .returning()
      .get() as Bail | undefined
  },

  delete(id: number): void {
    getDb().delete(baux).where(eq(baux.id, id)).run()
  }
}
