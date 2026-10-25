import { describe, it, expect } from 'vitest'
import { mediane, quartiles, segmentsParType, suspects, simulerRattrapageIrl, uniteReference } from '../shared/stats'

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
    { designation: 'A1', type_bien: 'Appartement', meuble: false, surface_m2: 50, valeur_venale: null, baseMensuelle: 650, bailId: 1 },   // 13 €/m²
    { designation: 'A2', type_bien: 'Appartement', meuble: false, surface_m2: 55, valeur_venale: null, baseMensuelle: 427, bailId: 2 },   // 7,76
    { designation: 'A3', type_bien: 'Appartement', meuble: false, surface_m2: 34, valeur_venale: null, baseMensuelle: 650, bailId: 3 },   // 19,12
    { designation: 'G1', type_bien: 'Garage', meuble: false, surface_m2: 13, valeur_venale: null, baseMensuelle: 65, bailId: 4 },          // 65 €/empl
    { designation: 'G2', type_bien: 'Garage', meuble: false, surface_m2: 30, valeur_venale: null, baseMensuelle: 91, bailId: 5 }           // 91 €/empl
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
    expect(sus.length).toBe(1)
    expect(sus[0].designation).toBe('A2')
    expect(sus[0].manqueAGagnerAnnuel).toBe(Math.round((13 - 7.76) * 12 * 100) / 100)
  })
})

describe('simulerRattrapageIrl', () => {
  const baux = [
    { bailId: 1, designation: 'A1', locataire: 'X', loyerHcActuel: 400, dateDebutBail: '2019-01-15', trimestreRef: 'T1 2019' }
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
      ['2019-Q1', 100], ['2020-Q1', 110], ['2021-Q1', 110]
    ])
    const r = simulerRattrapageIrl(
      [{ bailId: 1, designation: 'A', locataire: 'X', loyerHcActuel: 333.33, dateDebutBail: '2019-01-10', trimestreRef: 'T1 2019' }],
      2020, map, null
    )
    // 333,33 × 1,1 = 366,663 -> arrondi 366,66 ; puis ratio 1 -> inchangé
    expect(r[0].loyerSimule).toBe(366.66)
  })
  it('IRL manquant pour une année = pas de révision jouée', () => {
    const map = new Map([['2020-Q1', 110]]) // 2020-Q2 absent
    const r = simulerRattrapageIrl(
      [{ bailId: 1, designation: 'A', locataire: 'X', loyerHcActuel: 400, dateDebutBail: '2019-04-10', trimestreRef: 'T2 2019' }],
      2020, map, null
    )
    expect(r[0].loyerSimule).toBe(400)
    expect(r[0].revisionsJouees).toBe(0)
  })
})
