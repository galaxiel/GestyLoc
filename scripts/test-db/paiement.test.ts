// ============================================================================
// Tests repository PAIEMENTS — upsert par (bail_id, periode), conservation
// des métadonnées, et sémantique des statuts (partiel / trop-perçu).
// ============================================================================

import assert from 'node:assert/strict'
import { paiementRepository } from '../../src/main/repositories/paiement.repository'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

export async function registrePaiementTests(test: TestFn): Promise<void> {
  const designation = referenceUnique('T-PAIEMENT')
  const bien = bienRepository.create({ type_bien: 'Studio', designation, nom: designation }) as {
    id: number
  }
  const loc = locataireRepository.create({ nom_complet: referenceUnique('Loc Paiement') }) as {
    id: number
  }
  const bail = bailRepository.create({
    bien_id: bien.id,
    locataire_id: loc.id,
    date_debut_bail: '2025-01-01',
    loyer_hc: 400,
    charges: 50,
    loyer_cc: 450,
    actif: true
  }) as { id: number }

  await test('paiements: upsert conserve reference/notes à la modification', () => {
    paiementRepository.upsert({
      bail_id: bail.id,
      periode: '2026-10',
      montant_paye: 450,
      statut: 'paye',
      reference: 'VIREMENT 4521',
      notes: 'Rapprochement bancaire'
    })
    const maj = paiementRepository.upsert({
      bail_id: bail.id,
      periode: '2026-10',
      montant_paye: 450,
      statut: 'partiel',
      reference: 'VIREMENT 4521',
      notes: 'Rapprochement bancaire'
    }) as { statut: string; reference: string | null; notes: string | null }
    assert.equal(maj.statut, 'partiel')
    assert.equal(maj.reference, 'VIREMENT 4521', 'reference conservée (bug corrigé)')
    assert.equal(maj.notes, 'Rapprochement bancaire', 'notes conservées (bug corrigé)')
  })

  await test('paiements: trop-perçu accepté tel quel, sans statut spécifique', () => {
    // Comportement RÉEL de l'app : un paiement supérieur au loyer attendu
    // est enregistré avec le statut demandé (le bailleur gère le trop-perçu
    // hors application) — aucune exception, aucun statut « trop-perçu ».
    // Cf. docs/tests/ETAT-HARNAIS.md — défait suspecté, non corrigé.
    const p = paiementRepository.upsert({
      bail_id: bail.id,
      periode: '2026-11',
      montant_paye: 500, // 50 € de plus que le CC
      statut: 'paye'
    }) as { montant_paye: number; statut: string }
    assert.equal(p.montant_paye, 500, 'le montant saisi est conservé tel quel')
    assert.equal(p.statut, 'paye', 'pas de statut « trop-perçu » dans le modèle')
  })

  await test('paiements: upsert écrase le statut précédent (dernier pointage gagne)', () => {
    paiementRepository.upsert({
      bail_id: bail.id,
      periode: '2026-12',
      montant_paye: 0,
      statut: 'impaye'
    })
    const p = paiementRepository.upsert({
      bail_id: bail.id,
      periode: '2026-12',
      montant_paye: 450,
      statut: 'paye'
    }) as { statut: string }
    assert.equal(p.statut, 'paye')
    assert.equal(
      paiementRepository.listByBail(bail.id).filter((x) => x.periode === '2026-12').length,
      1,
      'une seule ligne (clé composite)'
    )
  })
}
