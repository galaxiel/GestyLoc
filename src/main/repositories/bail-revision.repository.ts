import { desc, eq } from 'drizzle-orm'
import { getDb } from '../database/connection'
import { bauxRevisions } from '../database/schema'
import type { BailRevision, CreateBailRevisionInput } from '@shared/types'

/**
 * Repository : historique des révisions de loyer (migration 0012).
 * Une ligne par révision appliquée — alimente l'historique de la fiche bail
 * et la future comparaison loyer théorique vs appliqué du simulateur.
 */
export const bailRevisionRepository = {
  /** Toutes les révisions (tous baux) — pour le comparatif du simulateur. */
  listAll(): BailRevision[] {
    return getDb()
      .select()
      .from(bauxRevisions)
      .orderBy(desc(bauxRevisions.date_revision))
      .all() as BailRevision[]
  },

  listByBail(bailId: number): BailRevision[] {
    return getDb()
      .select()
      .from(bauxRevisions)
      .where(eq(bauxRevisions.bail_id, bailId))
      .orderBy(desc(bauxRevisions.date_revision))
      .all() as BailRevision[]
  },

  create(input: CreateBailRevisionInput): BailRevision {
    return getDb().insert(bauxRevisions).values(input).returning().get() as BailRevision
  }
}
