import { and, eq } from 'drizzle-orm'
import { getDb } from '../database/connection'
import { regularisationsCharges } from '../database/schema'
import type { RegularisationCharges } from '@shared/types'

/** Repository : régularisation annuelle des charges (provisions vs réelles). */
export const regularisationRepository = {
  list(): RegularisationCharges[] {
    return getDb()
      .select()
      .from(regularisationsCharges)
      .all() as RegularisationCharges[]
  },

  get(bailId: number, annee: number): RegularisationCharges | undefined {
    return getDb()
      .select()
      .from(regularisationsCharges)
      .where(
        and(
          eq(regularisationsCharges.bail_id, bailId),
          eq(regularisationsCharges.annee, annee)
        )
      )
      .get() as RegularisationCharges | undefined
  },

  /** Crée ou met à jour les charges réelles d'un bail pour une année. */
  upsert(bailId: number, annee: number, chargesReelles: number): RegularisationCharges {
    return getDb()
      .insert(regularisationsCharges)
      .values({ bail_id: bailId, annee, charges_reelles: chargesReelles })
      .onConflictDoUpdate({
        target: [regularisationsCharges.bail_id, regularisationsCharges.annee],
        set: {
          charges_reelles: chargesReelles,
          regularise_le: new Date().toISOString()
        }
      })
      .returning()
      .get() as RegularisationCharges
  }
}
