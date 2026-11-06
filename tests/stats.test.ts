import { describe, it, expect } from 'vitest'
import {
  mediane,
  quartiles,
  segmentsParType,
  suspects,
  simulerRattrapageIrl,
  uniteReference
} from '../shared/stats'

describe('mediane / quartiles', () => {
  it('gère les effectifs 0, 1, 2, 3', () => {
    expect(mediane([])).toBeNull()
    expect(mediane([5])).toBe(5)
    expect(mediane([5, 7])).toBe(6)
    expect(mediane([3, 5, 7])).toBe(5)
    const q = quartiles([1, 2, 3, 4, 5, 6, 7])
    expect(q.med).toBe(4)
    expect(q.q1).toBe(2)
    expect(q.q3).toBe(6)
  })
})

describe('uniteReference (R2)', () => {
  it('garage/parking = emplacement, le reste = m2', () => {
    expect(uniteReference('Garage')).toBe('emplacement')
    expect(uniteReference('Parking')).toBe('emplacement')
    expect(uniteReference('Appartement')).toBe('m2')
  })
})

describe('segmentsParType (R1 : pas de ratio sur un mélange)', () => {
  const biens = [
    {
      designation: 'A1',
      locataire: 'X',
      type_bien: 'Appartement',
      meuble: false,
      surface_m2: 50,
      valeur_venale: null,
      baseMensuelle: 650,
      bailId: 1
    }, // 13 €/m²
    {
      designation: 'A2',
      locataire: 'X',
      type_bien: 'Appartement',
      meuble: false,
      surface_m2: 55,
      valeur_venale: null,
      baseMensuelle: 427,
      bailId: 2
    }, // 7,76
    {
      designation: 'A3',
      locataire: 'X',
      type_bien: 'Appartement',
      meuble: false,
      surface_m2: 34,
      valeur_venale: null,
      baseMensuelle: 650,
      bailId: 3
    }, // 19,12
    {
      designation: 'G1',
      locataire: 'X',
      type_bien: 'Garage',
      meuble: false,
      surface_m2: 13,
      valeur_venale: null,
      baseMensuelle: 65,
      bailId: 4
    }, // 65 €/empl
    {
      designation: 'G2',
      locataire: 'X',
      type_bien: 'Garage',
      meuble: false,
      surface_m2: 30,
      valeur_venale: null,
      baseMensuelle: 91,
      bailId: 5
    } // 91 €/empl
  ]
  it('sépare les segments et calcule les unités propres', () => {
    const sgs = segmentsParType(biens)
    const appart = sgs.find((s) => s.type === 'Appartement')!
    const garage = sgs.find((s) => s.type === 'Garage')!
    expect(appart.unite).toBe('m2')
    expect(garage.unite).toBe('emplacement')
    expect(appart.med).toBe(13) // médiane de [7.76, 13, 19.12]
    // la médiane garage est en €/emplacement, jamais en €/m²
    expect(garage.med).toBe(78) // médiane de [65, 91] = moyenne des 2
  })
  it('le suspect A2 (-40 % sous la médiane) est détecté', () => {
    const sus = suspects(segmentsParType(biens))
    // R3 : le segment garage (n=2) est exclu ; seul A2 (segment de 3+) est suspect
    expect(sus.length).toBe(1)
    expect(sus[0].designation).toBe('A2')
    // Manque annuel RÉEL : (med - valeur) €/m²/mois × 12 × surface (55 m²)
    expect(sus[0].manqueAGagnerAnnuel).toBe(Math.round((13 - 7.76) * 12 * 55 * 100) / 100)
  })

  it('un bien sans surface ou sans loyer est exclu des ratios (pas de faux suspect à 0)', () => {
    const avecNuls = [
      ...biens,
      {
        designation: 'A4-sans-surface',
        locataire: 'X',
        type_bien: 'Appartement',
        meuble: false,
        surface_m2: null,
        valeur_venale: null,
        baseMensuelle: 650,
        bailId: 6
      },
      {
        designation: 'A5-sans-loyer',
        locataire: 'X',
        type_bien: 'Appartement',
        meuble: false,
        surface_m2: 40,
        valeur_venale: null,
        baseMensuelle: null,
        bailId: 7
      }
    ]
    const appart = segmentsParType(avecNuls).find((s) => s.type === 'Appartement')!
    // Le parc compte 5 biens mais seuls 3 ont un ratio calculable
    expect(appart.n).toBe(5)
    expect(appart.ratios.length).toBe(3)
    // La médiane n'est PAS tirée vers le bas par des 0 fictifs
    expect(appart.med).toBe(13)
    // A4/A5 ne ressortent pas en suspects
    expect(suspects(segmentsParType(avecNuls)).map((s) => s.designation)).toEqual(['A2'])
  })
})

describe('simulerRattrapageIrl', () => {
  const baux = [
    {
      bailId: 1,
      designation: 'A1',
      locataire: 'X',
      loyerHcActuel: 400,
      dateDebutBail: '2019-01-15',
      trimestreRef: 'T1 2019'
    }
  ]
  it('taux fixe 0 % = identité (régression)', () => {
    const r = simulerRattrapageIrl(baux, 2020, null, 0)
    expect(r[0].loyerSimule).toBe(400)
    expect(r[0].deltaAn).toBe(0)
  })
  it('taux fixe croissant = monotone et >= loyer actuel', () => {
    const r = simulerRattrapageIrl(baux, 2020, null, 2)
    expect(r[0].loyerSimule).toBeGreaterThanOrEqual(400)
    expect(r[0].deltaAn).toBe(Math.round((r[0].loyerSimule - 400) * 12 * 100) / 100)
  })
  it('arrondi au centime à chaque révision (règle légale)', () => {
    // IRL factice : +10 % la première année, puis identique
    const map = new Map([
      ['2019-Q1', 100],
      ['2020-Q1', 110],
      ['2021-Q1', 110]
    ])
    const r = simulerRattrapageIrl(
      [
        {
          bailId: 1,
          designation: 'A',
          locataire: 'X',
          loyerHcActuel: 333.33,
          dateDebutBail: '2019-01-10',
          trimestreRef: 'T1 2019'
        }
      ],
      2020,
      map,
      null
    )
    // 333,33 × 1,1 = 366,663 -> arrondi 366,66 ; puis ratio 1 -> inchangé
    expect(r[0].loyerSimule).toBe(366.66)
  })
  it('IRL manquant pour une année = pas de révision jouée', () => {
    const map = new Map([['2020-Q1', 110]]) // 2020-Q2 absent
    const r = simulerRattrapageIrl(
      [
        {
          bailId: 1,
          designation: 'A',
          locataire: 'X',
          loyerHcActuel: 400,
          dateDebutBail: '2019-04-10',
          trimestreRef: 'T2 2019'
        }
      ],
      2020,
      map,
      null
    )
    expect(r[0].loyerSimule).toBe(400)
    expect(r[0].revisionsJouees).toBe(0)
  })
})

// ============================================================================
// Priorité 1 (risque financier) — chaînes de révision IRL : arrondi au
// centime À CHAQUE étape (règle codée), indices réels INSEE (shared/irl-insee.ts),
// anniversaire 29 février (année bissextile), trimestre de référence ancré.
// ============================================================================

describe('chaînes de révision IRL (priorité 1)', () => {
  it('chaîne 2024 → 2025 → 2026 avec indices réels : arrondi au centime À CHAQUE révision', () => {
    // Indices publics INSEE (shared/irl-insee.ts). Le simulateur rejoue les
    // anniversaires année par année : chaque ratio = T(n) année précédente /
    // T(n) cette année, avec arrondi au centime entre chaque étape.
    const map = new Map([
      ['2023-Q3', 141.03],
      ['2024-Q3', 144.51],
      ['2025-Q3', 145.77],
      ['2026-Q3', 148.06]
    ])
    const r = simulerRattrapageIrl(
      [
        {
          bailId: 1,
          designation: 'chaîne',
          locataire: 'X',
          loyerHcActuel: 640,
          dateDebutBail: '2023-10-01',
          trimestreRef: 'T3 2023'
        }
      ],
      2024,
      map,
      null
    )
    const etape1 = Math.round(640 * (144.51 / 141.03) * 100) / 100
    const etape2 = Math.round(etape1 * (145.77 / 144.51) * 100) / 100
    const etape3 = Math.round(etape2 * (148.06 / 145.77) * 100) / 100
    expect(r[0].loyerSimule).toBe(etape3)
    expect(r[0].revisionsJouees).toBe(3)
    // NOTE : la preuve de l'arrondi intermédiaire est donnée par la mutation
    // (retrait du round2 dans simulerRattrapageIrl → ce test échoue, cf.
    // docs/tests/ETAT-HARNAIS.md). Sur cette chaîne, le résultat coïncide
    // avec un calcul en une fois — l'arrondi est absorbé sur ces valeurs.
  })

  it('anniversaire 29 février : révisé le 28/02 les années non bissextiles', () => {
    // Bail débuté le 29/02/2024 — l'anniversaire 2025 tombe le 28/02.
    const map = new Map([
      ['2024-Q1', 130],
      ['2025-Q1', 133.25]
    ])
    const r = simulerRattrapageIrl(
      [
        {
          bailId: 2,
          designation: 'bissex',
          locataire: 'X',
          loyerHcActuel: 400,
          dateDebutBail: '2024-02-29',
          trimestreRef: 'T1 2024'
        }
      ],
      2025,
      map,
      null
    )
    // L'anniversaire 2025 (28/02/2025, borné) est joué : ratio 133.25/130.
    expect(r[0].revisionsJouees).toBe(1)
    expect(r[0].loyerSimule).toBe(Math.round(400 * (133.25 / 130) * 100) / 100)
  })

  it('le trimestre de référence est ANCRÉ (« T3 2023 » → 3, pas le 2 de 2023)', () => {
    const map = new Map([
      ['2023-Q3', 141.03],
      ['2024-Q3', 144.51],
      ['2023-Q2', 139.96], // piège : si le parse attrapait « 2 », il lirait cette paire
      ['2024-Q2', 143.45]
    ])
    const r = simulerRattrapageIrl(
      [
        {
          bailId: 3,
          designation: 'ancrage',
          locataire: 'X',
          loyerHcActuel: 400,
          dateDebutBail: '2023-10-01',
          trimestreRef: 'T3 2023'
        }
      ],
      2024,
      map,
      null
    )
    // Si le parse attrapait « 2 » (de 2023), le ratio serait 143.45/139.96.
    expect(r[0].loyerSimule).toBe(Math.round(400 * (144.51 / 141.03) * 100) / 100)
    expect(r[0].loyerSimule).not.toBe(Math.round(400 * (143.45 / 139.96) * 100) / 100)
  })
})
