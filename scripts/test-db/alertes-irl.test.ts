// ============================================================================
// Alertes IRL et assurance (priorité 1 — risque financier) : anniversaire
// (art. 17-2 tel qu'implémenté dans alertes.service.ts), indices réels de
// shared/irl-insee.ts, traçage des demandes d'assurance (migration 0013).
// Les dates sont dérivées de la date du jour pour rester valides des années.
// ============================================================================

import assert from 'node:assert/strict'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import { computeAlertes } from '../../src/main/services/alertes.service'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

const ISO = (d: Date): string => d.toISOString().slice(0, 10)

/** Crée bien + locataire + bail en une fois, retourne les ids. */
function creerDossier(
  designation: string,
  locataire: string,
  bail: Record<string, unknown>
): number {
  const bien = bienRepository.create({
    type_bien: 'Appartement',
    designation,
    nom: designation
  }) as { id: number }
  const loc = locataireRepository.create({ nom_complet: locataire }) as { id: number }
  return (
    bailRepository.create({
      bien_id: bien.id,
      locataire_id: loc.id,
      jour_paiement: 1,
      actif: true,
      ...bail
    }) as { id: number }
  ).id
}

export async function registreAlertesIrlTests(test: TestFn): Promise<void> {
  const aujourdHui = new Date()
  const annee = aujourdHui.getFullYear()

  // Anniversaire passé cette année (1er avril) sans révision → alerte.
  const bailNonRevise = creerDossier(referenceUnique('T-IRL-nonrev'), 'Zoé NonRev', {
    date_debut_bail: `${annee - 3}-04-01`,
    loyer_hc: 580,
    charges: 70,
    loyer_cc: 650,
    irl_reference: 141.03
  })

  // Révisé exactement à l'anniversaire de cette année → pas d'alerte.
  const anniversaireCetteAnnee = `${annee}-04-01`
  const bailReviseCetteAnnee = creerDossier(referenceUnique('T-IRL-rev-an'), 'Alain RevAn', {
    date_debut_bail: `${annee - 2}-04-01`,
    loyer_hc: 590,
    charges: 70,
    loyer_cc: 660,
    irl_reference: 145.77,
    irl_nouveau: 145.77,
    taux_irl: 1.571,
    date_derniere_revision: anniversaireCetteAnnee
  })

  // Révisé l'année passée seulement → alerte (anniversaire de cette année raté).
  const bailReviseAnPasse = creerDossier(referenceUnique('T-IRL-rev-j1'), 'Brigitte RevJ1', {
    date_debut_bail: `${annee - 3}-04-01`,
    loyer_hc: 600,
    charges: 70,
    loyer_cc: 670,
    irl_reference: 144.51,
    irl_nouveau: 144.51,
    taux_irl: 2.468,
    date_derniere_revision: `${annee - 1}-04-01`
  })

  // Sans irl_reference → jamais d'alerte (condition du code).
  const bailSansIrl = creerDossier(referenceUnique('T-IRL-sansirl'), 'Cédric SansIrl', {
    date_debut_bail: `${annee - 5}-04-01`,
    loyer_hc: 610,
    charges: 70,
    loyer_cc: 680
  })

  // Assurance : anniversaire dans ~15 jours → alerte ; puis demande tracée
  // (assurance_demandee_le = aujourd'hui) → plus d'alerte ; et une demande
  // vieille de plus de 330 jours → alerte à nouveau.
  const annivDans15 = new Date(aujourdHui.getTime() + 15 * 86400000)
  const debutAssurance = ISO(new Date(annivDans15.getTime() - 366 * 86400000))
  const bailAssurance = creerDossier(referenceUnique('T-ASSUR'), 'Dominique Assur', {
    date_debut_bail: debutAssurance,
    loyer_hc: 620,
    charges: 70,
    loyer_cc: 690
  })

  await test('alertes IRL : anniversaire passé sans révision → alerte revision_irl', () => {
    const alertes = computeAlertes(bailRepository.listWithRelations())
    assert.ok(
      alertes.some((a) => a.type === 'revision_irl' && a.bail_id === bailNonRevise),
      'l’anniversaire raté doit déclencher l’alerte'
    )
  })

  await test('alertes IRL : révisé à l’anniversaire de cette année → pas d’alerte', () => {
    const alertes = computeAlertes(bailRepository.listWithRelations())
    assert.ok(
      !alertes.some((a) => a.type === 'revision_irl' && a.bail_id === bailReviseCetteAnnee),
      'révision à l’anniversaire courant → pas d’alerte'
    )
  })

  await test('alertes IRL : révisé l’année passée (anniversaire courant raté) → alerte', () => {
    const alertes = computeAlertes(bailRepository.listWithRelations())
    assert.ok(
      alertes.some((a) => a.type === 'revision_irl' && a.bail_id === bailReviseAnPasse),
      'anniversaire courant non révisé → alerte'
    )
  })

  await test('alertes IRL : sans irl_reference → jamais d’alerte', () => {
    const alertes = computeAlertes(bailRepository.listWithRelations())
    assert.ok(!alertes.some((a) => a.bail_id === bailSansIrl && a.type === 'revision_irl'))
    assert.ok(!alertes.some((a) => a.bail_id === bailSansIrl && a.type === 'assurance'))
  })

  await test('assurance : anniversaire dans ~15 jours → alerte assurance', () => {
    const alertes = computeAlertes(bailRepository.listWithRelations())
    assert.ok(
      alertes.some((a) => a.type === 'assurance' && a.bail_id === bailAssurance),
      'anniversaire < 30 jours → alerte assurance'
    )
  })

  await test('assurance : demande tracée aujourd’hui (330 jours) → plus d’alerte', () => {
    bailRepository.update(bailAssurance, { assurance_demandee_le: ISO(aujourdHui) })
    const alertes = computeAlertes(bailRepository.listWithRelations())
    assert.ok(
      !alertes.some((a) => a.type === 'assurance' && a.bail_id === bailAssurance),
      'demande < 330 jours → pas d’alerte (traçage migration 0013)'
    )
  })

  await test('assurance : demande ancienne (> 330 jours) → alerte à nouveau', () => {
    const ancienne = ISO(new Date(aujourdHui.getTime() - 340 * 86400000))
    bailRepository.update(bailAssurance, { assurance_demandee_le: ancienne })
    const alertes = computeAlertes(bailRepository.listWithRelations())
    assert.ok(
      alertes.some((a) => a.type === 'assurance' && a.bail_id === bailAssurance),
      'demande > 330 jours → il faut relancer'
    )
  })

  await test('occupation gratuite : jamais d’alerte IRL ni d’assurance', () => {
    const id = creerDossier(referenceUnique('T-IRL-gratuit'), 'Florence Gratuit', {
      date_debut_bail: `${annee - 4}-04-01`,
      occupation_gratuite: true,
      loyer_hc: null,
      charges: null,
      loyer_cc: null
    })
    const alertes = computeAlertes(bailRepository.listWithRelations())
    assert.ok(!alertes.some((a) => a.bail_id === id), 'bail gratuit : aucune alerte')
  })

  // Nettoyage : les paiements du mois courant pointés pour neutraliser
  // l'alerte « mois courant non pointé » sur les baux de test (sinon elle
  // pollue les autres assertions d'alertes impayé).
}
