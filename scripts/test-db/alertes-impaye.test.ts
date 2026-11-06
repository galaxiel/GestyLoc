// ============================================================================
// Tests alertes IMPAYÉS — branches indépendantes de la date du jour
// (statuts pointés) + marge d'échéancier + exclusion occupation gratuite.
// ============================================================================

import assert from 'node:assert/strict'
import { computeAlertes, margeRetardJours } from '../../src/main/services/alertes.service'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import { paiementRepository } from '../../src/main/repositories/paiement.repository'
import { parametresRepository } from '../../src/main/repositories/parametres.repository'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

export async function registreAlertesImpayeTests(test: TestFn): Promise<void> {
  const designation = referenceUnique('T-ALERTIMP')
  const bien1 = bienRepository.create({ type_bien: 'Garage', designation, nom: designation }) as {
    id: number
  }
  const loc1 = locataireRepository.create({ nom_complet: referenceUnique('Loc AlertImp') }) as {
    id: number
  }
  const bail1 = bailRepository.create({
    bien_id: bien1.id,
    locataire_id: loc1.id,
    date_debut_bail: '2026-01-15',
    loyer_hc: 400,
    charges: 50,
    loyer_cc: 450,
    jour_paiement: 5,
    actif: true
  }) as { id: number }

  await test('alertes: pointage retard -> alerte impaye ; pointé payé -> rien', () => {
    // Statut pointé = branche indépendante de la date du jour (pas de flaky).
    paiementRepository.upsert({
      bail_id: bail1.id,
      periode: '2026-09',
      montant_paye: 450,
      statut: 'retard'
    })
    const rows = bailRepository.listWithRelations()
    const alertes1 = computeAlertes(rows)
    assert.ok(
      alertes1.some((a) => a.type === 'impaye' && a.bail_id === bail1.id),
      'le pointage retard génère une alerte'
    )
    paiementRepository.upsert({
      bail_id: bail1.id,
      periode: '2026-09',
      montant_paye: 450,
      statut: 'paye'
    })
    const alertes2 = computeAlertes(bailRepository.listWithRelations())
    assert.ok(
      !alertes2.some(
        (a) => a.type === 'impaye' && a.bail_id === bail1.id && a.message.includes('2026-09')
      ),
      'plus d’alerte pour la période payée'
    )
  })

  await test('alertes: marge de retard lue depuis les paramètres (échéancier)', () => {
    assert.equal(margeRetardJours(), 0, 'défaut 0 j')
    parametresRepository.set('echeancier', { marge_retard_jours: 3 })
    assert.equal(margeRetardJours(), 3)
    parametresRepository.set('echeancier', { marge_retard_jours: 'bogus' })
    assert.equal(margeRetardJours(), 0, 'valeur invalide -> défaut 0')
    parametresRepository.set('echeancier', { marge_retard_jours: 0 })
  })

  await test('occupation gratuite: exclue des alertes loyer', () => {
    const bail3 = bailRepository.create({
      bien_id: bien1.id,
      locataire_id: loc1.id,
      actif: true,
      occupation_gratuite: true
    }) as { id: number }
    const alertes = computeAlertes(bailRepository.listWithRelations())
    assert.ok(!alertes.some((a) => a.bail_id === bail3), 'aucune alerte pour un bail gratuit')
  })
}
