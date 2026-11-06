// ============================================================================
// Tests audit.service (priorité 4) : les 6 familles de constats. On crée
// des données volontairement incohérentes et on attend les constats exacts.
// Défaut suspecté DOCUMENTÉ (non corrigé) : le contrôle « Paire IRL non
// annuelle » (paireLegale) est informationnel et toujours vrai dès lors que
// taux_irl ≠ 0 — il ne détecte donc jamais rien (cf. test dédié).
// ============================================================================

import assert from 'node:assert/strict'
import { auditerDonnees } from '../../src/main/services/audit.service'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

function dossier(designation: string, locataire: string, bail: Record<string, unknown>): number {
  const bien = bienRepository.create({
    type_bien: 'Appartement',
    designation,
    nom: designation,
    adresse: '12 rue de Test'
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

const bailPropre = (): number =>
  dossier(referenceUnique('T-AUDIT-propre'), referenceUnique('Loc Audit'), {
    date_debut_bail: '2023-04-01',
    date_fin_bail: '2026-03-31',
    loyer_hc: 500,
    charges: 60,
    loyer_cc: 560,
    loyer_annuel_hc: 6000,
    loyer_annuel_cc: 6720,
    irl_reference: 141.03,
    trimestre_reference: 'T1 2023'
  })

const categorie = (constats: { categorie: string; designation: string }[], nom: string): string[] =>
  constats.filter((c) => c.designation.includes(nom)).map((c) => c.categorie)

export function registreAuditTests(test: TestFn): void {
  const nomAdresseVide = referenceUnique('T-AUDIT-adresse')
  const nomDoublonA = referenceUnique('T-AUDIT-doublon A')
  const nomIrlFaux = referenceUnique('T-AUDIT-irlfaux')
  const nomAnnuel = referenceUnique('T-AUDIT-annuel')
  const nomCc = referenceUnique('T-AUDIT-cc')
  const nomSansLoyer = referenceUnique('T-AUDIT-sansloyer')
  const nomSansFin = referenceUnique('T-AUDIT-sansfin')
  const nomIrlInconnu = referenceUnique('T-AUDIT-irlinconnu')
  const nomPaire = referenceUnique('T-AUDIT-paire')

  test('audit : adresse manquante → constat critique', () => {
    const bienSansAdresse = bienRepository.create({
      type_bien: 'Studio',
      designation: nomAdresseVide,
      nom: nomAdresseVide,
      adresse: null
    }) as { id: number }
    const loc = locataireRepository.create({ nom_complet: referenceUnique('Loc Adr') }) as {
      id: number
    }
    bailRepository.create({
      bien_id: bienSansAdresse.id,
      locataire_id: loc.id,
      date_debut_bail: '2024-01-01',
      loyer_hc: 400,
      loyer_cc: 400,
      actif: true
    })
    const constats = auditerDonnees()
    assert.ok(
      categorie(constats, nomAdresseVide).includes('Adresse manquante'),
      'adresse vide → constat critique'
    )
  })

  test('audit : doublon de locataire normalisé (« jean-dupont. » vs « Jean Dupont »)', () => {
    const loc1 = locataireRepository.create({ nom_complet: 'Jean Dupont' }) as { id: number }
    const loc2 = locataireRepository.create({ nom_complet: 'jean-dupont.' }) as { id: number }
    const bien = bienRepository.create({
      type_bien: 'Studio',
      designation: nomDoublonA,
      nom: nomDoublonA,
      adresse: '12 rue de Test'
    }) as { id: number }
    bailRepository.create({
      bien_id: bien.id,
      locataire_id: loc1.id,
      actif: true,
      loyer_hc: 400,
      loyer_cc: 400
    })
    bailRepository.create({
      bien_id: bien.id,
      locataire_id: loc2.id,
      actif: true,
      loyer_hc: 400,
      loyer_cc: 400
    })
    const constats = auditerDonnees()
    assert.ok(
      constats.some(
        (c) => c.categorie === 'Doublon de locataire' && c.designation.includes('Jean Dupont')
      ),
      'noms normalisés identiques → constat doublon'
    )
  })

  test('audit : IRL de référence ≠ INSEE pour le trimestre → constat critique', () => {
    dossier(nomIrlFaux, referenceUnique('Loc IrlFaux'), {
      date_debut_bail: '2023-04-01',
      date_fin_bail: '2026-03-31',
      loyer_hc: 500,
      charges: 60,
      loyer_cc: 560,
      irl_reference: 999, // ≠ INSEE T1 2023 (141.03)
      trimestre_reference: 'T1 2023'
    })
    const constats = auditerDonnees()
    assert.ok(
      categorie(constats, nomIrlFaux).includes('IRL de référence non officielle'),
      'IRL fausse → constat critique'
    )
  })

  test('audit : trimestre de référence illisible → constat attention', () => {
    dossier(nomIrlInconnu, referenceUnique('Loc IrlInconnu'), {
      date_debut_bail: '2023-04-01',
      date_fin_bail: '2026-03-31',
      loyer_hc: 500,
      charges: 60,
      loyer_cc: 560,
      irl_reference: 141.03,
      trimestre_reference: 'genre vide'
    })
    const constats = auditerDonnees()
    assert.ok(categorie(constats, nomIrlInconnu).includes('Trimestre de référence illisible'))
  })

  test('audit : loyer annuel incohérent + CC ≠ HC + charges → constats critiques/attention', () => {
    dossier(nomAnnuel, referenceUnique('Loc Annuel'), {
      date_debut_bail: '2023-04-01',
      date_fin_bail: '2026-03-31',
      loyer_hc: 500,
      charges: 60,
      loyer_cc: 560,
      loyer_annuel_hc: 7000, // ≠ 6000
      loyer_annuel_cc: 6720
    })
    dossier(nomCc, referenceUnique('Loc Cc'), {
      date_debut_bail: '2023-04-01',
      date_fin_bail: '2026-03-31',
      loyer_hc: 500,
      charges: 60,
      loyer_cc: 700, // ≠ 560
      loyer_annuel_hc: 6000,
      loyer_annuel_cc: 8400
    })
    const constats = auditerDonnees()
    assert.ok(categorie(constats, nomAnnuel).includes('Loyer annuel HC incohérent'))
    assert.ok(categorie(constats, nomCc).includes('Loyer CC incohérent'))
  })

  test('audit : bail actif sans loyer, et bail sans date de fin → constats attention', () => {
    dossier(nomSansLoyer, referenceUnique('Loc SansLoyer'), {
      date_debut_bail: '2023-04-01',
      date_fin_bail: '2026-03-31',
      loyer_hc: null,
      loyer_cc: null
    })
    dossier(nomSansFin, referenceUnique('Loc SansFin'), {
      date_debut_bail: '2023-04-01',
      loyer_hc: 500,
      charges: 60,
      loyer_cc: 560
    })
    const constats = auditerDonnees()
    assert.ok(categorie(constats, nomSansLoyer).includes('Bail actif sans loyer'))
    assert.ok(categorie(constats, nomSansFin).includes('Bail sans date de fin'))
  })

  test('DÉFAUT SUSPECTÉ documenté : « Paire IRL non annuelle » ne détecte jamais rien', () => {
    // paireLegale = (index T(n+1) connu) && (taux ≠ 0) — toujours vrai pour
    // une paire quelconque avec taux ≠ 0 (ex : 141.03 → 148.06 sur 2 ans,
    // taux 5 %, jamais signalé). Comportement RÉEL documenté, non corrigé :
    // si ce test échoue un jour, quelqu'un a corrigé le contrôle.
    const nomPaireBail = referenceUnique('T-AUDIT-paire')
    void nomPaire
    dossier(nomPaireBail, referenceUnique('Loc Paire'), {
      date_debut_bail: '2023-04-01',
      date_fin_bail: '2026-03-31',
      loyer_hc: 500,
      charges: 60,
      loyer_cc: 560,
      irl_reference: 144.51, // T3 2024
      irl_nouveau: 148.06, // T3 2026 — paire sur 2 ANS (non légale)
      taux_irl: 2.457,
      trimestre_reference: 'T3 2024'
    })
    const constats = auditerDonnees()
    // Le bail a un trimestre lisible et une IRL ref officielle → pas d'autres
    // constats IRL ; et « Paire IRL non annuelle » NE SORT PAS (défaut).
    assert.ok(
      !constats.some(
        (c) => c.categorie === 'Paire IRL non annuelle' && c.designation.includes(nomPaireBail)
      ),
      'comportement actuel : la paire sur 2 ans n’est pas détectée (défaut suspecté)'
    )
  })

  test('audit : un bail propre ne génère AUCUN constat (régression)', () => {
    const nomPropre = referenceUnique('T-AUDIT-propre-bis')
    const locPropre = referenceUnique('Loc PropreBis')
    void bailPropre // gardé pour usage futur (base propre de référence)
    dossier(nomPropre, locPropre, {
      date_debut_bail: '2023-04-01',
      date_fin_bail: '2026-03-31',
      loyer_hc: 500,
      charges: 60,
      loyer_cc: 560,
      loyer_annuel_hc: 6000,
      loyer_annuel_cc: 6720,
      irl_reference: 141.03, // = INSEE T3 2023 (la paire doit être cohérente
      trimestre_reference: 'T3 2023' // avec le trimestre, sinon constat)
    })
    const constats = auditerDonnees()
    // Les constats référencent « designation (locataire) » : avec un couple
    // unique, aucun constat ne doit concerner ce bail propre.
    const duPropre = constats.filter(
      (c) => c.designation.includes(nomPropre) || c.designation.includes(locPropre)
    )
    assert.deepEqual(duPropre, [], 'bail propre : zéro constat')
  })
}
