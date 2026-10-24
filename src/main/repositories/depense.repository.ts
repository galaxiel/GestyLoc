import { eq, desc } from 'drizzle-orm'
import { getDb } from '../database/connection'
import { depenses } from '../database/schema'
import type { Depense, CreateDepenseInput } from '@shared/types'

/**
 * Repository : dépenses par bien (travaux, PNO, taxe foncière...).
 * Alimente la rentabilité nette et le récap revenus fonciers.
 */
export const depenseRepository = {
  list(): Depense[] {
    return getDb()
      .select()
      .from(depenses)
      .orderBy(desc(depenses.date_depense), desc(depenses.id))
      .all() as Depense[]
  },

  listByBien(bienId: number): Depense[] {
    return getDb()
      .select()
      .from(depenses)
      .where(eq(depenses.bien_id, bienId))
      .orderBy(desc(depenses.date_depense))
      .all() as Depense[]
  },

  create(input: CreateDepenseInput): Depense {
    return getDb().insert(depenses).values(input).returning().get() as Depense
  },

  update(id: number, input: Partial<CreateDepenseInput>): Depense | undefined {
    return getDb()
      .update(depenses)
      .set({ ...input, updated_at: new Date().toISOString() })
      .where(eq(depenses.id, id))
      .returning()
      .get() as Depense | undefined
  },

  delete(id: number): void {
    getDb().delete(depenses).where(eq(depenses.id, id)).run()
  }
}
