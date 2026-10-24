import { and, eq, desc } from 'drizzle-orm'
import { getDb } from '../database/connection'
import { paiements } from '../database/schema'
import type { CreatePaiementInput, UpdatePaiementInput } from '@shared/types'

/**
 * Repository : suivi des paiements (loyers pointés payé/partiel/retard/impayé).
 * Un enregistrement = 1 bail × 1 mois (clé primaire composite).
 */
export const paiementRepository = {
  listByBail(bailId: number) {
    return getDb()
      .select()
      .from(paiements)
      .where(eq(paiements.bail_id, bailId))
      .orderBy(desc(paiements.periode))
      .all()
  },

  /** Tous les paiements (tous baux confondus) — utile au dashboard. */
  listAll() {
    return getDb()
      .select()
      .from(paiements)
      .orderBy(desc(paiements.periode))
      .all()
  },

  get(bailId: number, periode: string) {
    return getDb()
      .select()
      .from(paiements)
      .where(and(eq(paiements.bail_id, bailId), eq(paiements.periode, periode)))
      .get()
  },

  /** Crée ou met à jour (upsert) le pointage d'un mois pour un bail. */
  upsert(input: CreatePaiementInput) {
    return getDb()
      .insert(paiements)
      .values(input)
      .onConflictDoUpdate({
        target: [paiements.bail_id, paiements.periode],
        set: {
          montant_paye: input.montant_paye,
          statut: input.statut,
          date_paiement: input.date_paiement ?? null,
          mode_paiement: input.mode_paiement ?? null,
          updated_at: new Date().toISOString()
        }
      })
      .returning()
      .get()
  },

  update(bailId: number, periode: string, input: UpdatePaiementInput) {
    return getDb()
      .update(paiements)
      .set({ ...input, updated_at: new Date().toISOString() })
      .where(and(eq(paiements.bail_id, bailId), eq(paiements.periode, periode)))
      .returning()
      .get()
  },

  delete(bailId: number, periode: string): void {
    getDb()
      .delete(paiements)
      .where(and(eq(paiements.bail_id, bailId), eq(paiements.periode, periode)))
      .run()
  }
}
