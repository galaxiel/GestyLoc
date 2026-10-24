import { eq } from 'drizzle-orm'
import { getDb } from '../database/connection'
import { locataires } from '../database/schema'
import type { Locataire, CreateLocataireInput } from '@shared/types'

/**
 * Repository : accès aux données "Locataires".
 */
export const locataireRepository = {
  list(): Locataire[] {
    return getDb().select().from(locataires).all() as Locataire[]
  },

  getById(id: number): Locataire | undefined {
    return getDb().select().from(locataires).where(eq(locataires.id, id)).get() as
      | Locataire
      | undefined
  },

  create(input: CreateLocataireInput): Locataire {
    return getDb().insert(locataires).values(input).returning().get() as Locataire
  },

  update(id: number, input: Partial<CreateLocataireInput>): Locataire | undefined {
    const fields = input
    return getDb()
      .update(locataires)
      .set({ ...fields, updated_at: new Date().toISOString() })
      .where(eq(locataires.id, id))
      .returning()
      .get() as Locataire | undefined
  },

  delete(id: number): void {
    getDb().delete(locataires).where(eq(locataires.id, id)).run()
  }
}
