// ============================================================================
// Tests échéancier réel (priorité 3) : alerte « loyer non encaissé après le
// jour de paiement (+ marge) », jour de paiement décalé (aides), et
// comportement du pointage face au trop-perçu.
// Les dates sont construites autour de la date du jour → toujours valides.
// ============================================================================

import assert from 'node:assert/strict'
import { computeAlertes } from '../../src/main/services/alertes.service'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import { paiementRepository } from '../../src/main/repositories/paiement.repository'
import { parametresRepository } from '../../src/main/repositories/parametres.repository'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

const ISO = (d: Date): string => d.toISOString().slice(0, 10)

export function registreEcheancierTests(test: TestFn): void {
  const aujourdHui = new Date()
  const periode = `${aujourdHui.getFullYear()}-${String(aujourdHui.getMonth() + 1).padStart(2, '0')}`
  const jourDuMois = aujourdHui.getDate()

  function dossierJour(jour: number, designation: string): number {
    const bien = bienRepository.create({
      type_bien: 'Appartement',
      designation,
      nom: designation
    }) as { id: number }
    const loc = locataireRepository.create({ nom_complet: referenceUnique('Loc Éch') }) as {
      id: number
    }
    // date_debut il y a 2 ans le jour 1 → aucun prorata, l'échéancier du mois
    // courant est pleinement actif.
    return (
      bailRepository.create({
        bien_id: bien.id,
        locataire_id: loc.id,
        date_debut_bail: `${aujourdHui.getFullYear() - 2}-${String(aujourdHui.getMonth() + 1).padStart(2, '0')}-01`,
        loyer_hc: 500,
        charges: 50,
        loyer_cc: 550,
        jour_paiement: jour,
        actif: true
      }) as { id: number }
    ).id
  }

  // Mois courant = 28-31 jours → tous les jours de paiement ≤ 28 sont déjà
  // passés au 28 du mois ; on ne teste les cas « jour futur » qu'avec les
  // jours restants disponibles dans le mois courant.
  const jourPayePasse = Math.min(2, jourDuMois) // toujours ≤ aujourd'hui
  const jourPayeFutur = jourDuMois < 28 ? Math.min(jourDuMois + 5, 28) : null

  const bailJour2 = dossierJour(jourPayePasse, referenceUnique('T-ÉCH-j2'))
  const bailJourFutur = jourPayeFutur
    ? dossierJour(jourPayeFutur, referenceUnique('T-ÉCH-futur'))
    : null

  test(`échéancier : jour de paiement ${jourPayePasse} dépassé, mois non pointé → alerte`, () => {
    const alertes = computeAlertes(bailRepository.listWithRelations())
    const alerte = alertes.find((a) => a.bail_id === bailJour2 && a.type === 'impaye')
    assert.ok(alerte, `jour ${jourPayePasse} passé sans pointage → alerte`)
    assert.ok(alerte.message.includes('non encaissé'), 'message de l’échéancier réel')
  })

  test('échéancier : même mois pointé « payé » → plus d’alerte', () => {
    const b = bailRepository.getById(bailJour2) as { loyer_cc: number | null }
    paiementRepository.upsert({
      bail_id: bailJour2,
      periode,
      montant_paye: b?.loyer_cc ?? 550,
      statut: 'paye',
      date_paiement: ISO(aujourdHui)
    })
    const alertes = computeAlertes(bailRepository.listWithRelations())
    assert.ok(!alertes.some((a) => a.bail_id === bailJour2 && a.type === 'impaye'))
  })

  if (jourPayeFutur && bailJourFutur) {
    test(`échéancier : jour de paiement ${jourPayeFutur} à venir → pas encore d’alerte`, () => {
      const alertes = computeAlertes(bailRepository.listWithRelations())
      assert.ok(
        !alertes.some((a) => a.bail_id === bailJourFutur && a.type === 'impaye'),
        'le jour de paiement n’est pas encore passé → pas d’alerte'
      )
    })
  }

  test('échéancier : la marge repousse l’alerte (jour déjà passé mais dans la marge)', () => {
    // Le jour de paiement est dépassé de 1-3 jours : avec une marge >= au
    // retard, aucune alerte ; sans marge, alerte. On crée un bail dont le
    // jour de paiement = hier (si hier ≥ 1) et on joue sur la marge.
    const hier = jourDuMois - 1
    if (hier < 1) return // le 1er du mois : pas de « hier » dans le mois courant
    const bailHier = dossierJour(hier, referenceUnique('T-ÉCH-hier'))
    const alertesSansMarge = computeAlertes(bailRepository.listWithRelations())
    assert.ok(
      alertesSansMarge.some((a) => a.bail_id === bailHier && a.type === 'impaye'),
      'hier dépassé sans marge → alerte'
    )
    parametresRepository.set('echeancier', { marge_retard_jours: 5 })
    const alertesAvecMarge = computeAlertes(bailRepository.listWithRelations())
    assert.ok(
      !alertesAvecMarge.some((a) => a.bail_id === bailHier && a.type === 'impaye'),
      'retard de 1 j < marge de 5 j → pas d’alerte (aides sociales)'
    )
    parametresRepository.set('echeancier', { marge_retard_jours: 0 })
  })

  test('échéancier : jour décalé à 5 (aides) puis pointé → cohérent', () => {
    const bail5 = dossierJour(5, referenceUnique('T-ÉCH-j5'))
    // Selon la date du jour, le jour 5 est passé ou non — on vérifie la
    // COHÉRENCE : alerte si et seulement si joursDeRetard > 0 côté service.
    const alertes = computeAlertes(bailRepository.listWithRelations())
    const alerte = alertes.some((a) => a.bail_id === bail5 && a.type === 'impaye')
    const attendu = jourDuMois > 5 // jour 5 passé → alerte attendue
    assert.equal(alerte, attendu, `jour 5 : alerte=${alerte}, aujourd'hui=${jourDuMois}`)
    // Pointage → plus d'alerte, quel que soit le cas.
    const b = bailRepository.getById(bail5) as { loyer_cc: number | null }
    paiementRepository.upsert({
      bail_id: bail5,
      periode,
      montant_paye: b?.loyer_cc ?? 550,
      statut: 'paye'
    })
    assert.ok(
      !computeAlertes(bailRepository.listWithRelations()).some(
        (a) => a.bail_id === bail5 && a.type === 'impaye'
      )
    )
  })
}
