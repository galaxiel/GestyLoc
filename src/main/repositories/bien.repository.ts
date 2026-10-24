import { eq } from 'drizzle-orm'
import { getDb } from '../database/connection'
import { biens } from '../database/schema'
import type { Bien, CreateBienInput } from '@shared/types'

/**
 * Repository : accès aux données "Biens".
 * Aucune logique métier ici — uniquement des requêtes SQL typées par Drizzle.
 */
export const bienRepository = {
  list(): Bien[] {
    return getDb().select().from(biens).all() as Bien[]
  },

  getById(id: number): Bien | undefined {
    return getDb().select().from(biens).where(eq(biens.id, id)).get() as
      | Bien
      | undefined
  },

  create(input: CreateBienInput): Bien {
    return getDb().insert(biens).values(input).returning().get() as Bien
  },

  update(id: number, input: Partial<CreateBienInput>): Bien | undefined {
    // updated_at est mis à jour manuellement (SQLite n'a pas d'ON UPDATE).
    const fields = input
    return getDb()
      .update(biens)
      .set({ ...fields, updated_at: new Date().toISOString() })
      .where(eq(biens.id, id))
      .returning()
      .get() as Bien | undefined
  },

  delete(id: number): void {
    getDb().delete(biens).where(eq(biens.id, id)).run()
  }
}
