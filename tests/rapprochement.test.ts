import { describe, it, expect } from 'vitest'
import {
  parseReleve,
  proposerPointages,
  normaliseNom,
  periodePrecedente,
  cleRegle,
  type BailPourRapprochement
} from '../shared/rapprochement'

describe('normaliseNom / periodePrecedente', () => {
  it('normalise casse, accents, ponctuation', () => {
    expect(normaliseNom('Virement M. Cathelin-Jean')).toBe('virement m cathelin jean')
    expect(normaliseNom('ÉLODIE Moreau')).toBe('elodie moreau')
  })
  it("mois précédent, passage d'année", () => {
    expect(periodePrecedente('2026-11')).toBe('2026-10')
    expect(periodePrecedente('2026-01')).toBe('2025-12')
  })
})

describe('parseReleve', () => {
  it('parse un export Excel-fr avec en-têtes ; et BOM', () => {
    const csv =
      '\uFEFFDate;Libellé;Montant (€)\r\n' +
      '03/11/2026;Virement LOYER Cathelin;-450,00\r\n' +
      '05/11/2026;Prélèvement électricité;-89,90\r\n'
    const tx = parseReleve(csv)
    expect(tx).toHaveLength(2)
    expect(tx[0]).toEqual({ date: '2026-11-03', libelle: 'Virement LOYER Cathelin', montant: -450 })
    expect(tx[1].montant).toBe(-89.9)
  })

  it('parse un CSV à virgule avec en-têtes anglais', () => {
    const csv = 'Date,Description,Amount\n2026-11-03,Rent Dupont,-500.00\n'
    const tx = parseReleve(csv)
    expect(tx[0]).toEqual({ date: '2026-11-03', libelle: 'Rent Dupont', montant: -500 })
  })

  it('heuristique sans en-tête (date, montant, libellé)', () => {
    const csv = '04/11/2026;Cathelin Jean;loyer;-650,00\n'
    const tx = parseReleve(csv)
    expect(tx).toHaveLength(1)
    expect(tx[0].date).toBe('2026-11-04')
    expect(tx[0].montant).toBe(-650)
    expect(tx[0].libelle).toContain('Cathelin')
  })

  it('ignore les lignes non chiffrées (soldes, titres)', () => {
    const csv = 'Date;Libellé;Montant\nSolde au 01/11/2026;—;\n01/11/2026;Virement;-500,00\n'
    expect(parseReleve(csv)).toHaveLength(1)
  })
})

describe('proposerPointages', () => {
  const baux: BailPourRapprochement[] = [
    {
      bailId: 1,
      locataire: 'Jean Cathelin',
      designation: 'Garage renoir n°1',
      attendusParPeriode: [
        { periode: '2026-11', montant: 450 },
        { periode: '2026-10', montant: 450 }
      ]
    },
    {
      bailId: 2,
      locataire: 'Élodie Moreau',
      designation: 'Studio Rdc',
      attendusParPeriode: [
        { periode: '2026-11', montant: 450 },
        { periode: '2026-10', montant: 450 }
      ]
    },
    {
      bailId: 3,
      locataire: 'Marc Toto',
      designation: 'Appartement T3',
      attendusParPeriode: [
        { periode: '2026-11', montant: 650 },
        { periode: '2026-10', montant: 650 }
      ]
    }
  ]

  it('montant exact + nom dans le libellé = confiance haute', () => {
    const prop = proposerPointages(
      [{ date: '2026-11-03', libelle: 'Virement LOYER Cathelin Jean', montant: -450 }],
      baux,
      '2026-11'
    )
    expect(prop[0].bailId).toBe(1)
    expect(prop[0].confiance).toBe('haute')
    expect(prop[0].periode).toBe('2026-11')
  })

  it('montant ambigu (2 baux à 450) sans nom = à revoir, jamais au hasard', () => {
    const prop = proposerPointages(
      [{ date: '2026-11-03', libelle: 'Virement entrant', montant: -450 }],
      baux,
      '2026-11'
    )
    expect(prop[0].bailId).toBeNull()
    expect(prop[0].confiance).toBe('revoir')
  })

  it('montant unique sans nom = confiance moyenne (correspondance unique)', () => {
    const prop = proposerPointages(
      [{ date: '2026-11-04', libelle: 'Virement entrant', montant: -650 }],
      baux,
      '2026-11'
    )
    expect(prop[0].bailId).toBe(3)
    expect(prop[0].confiance).toBe('moyenne')
  })

  it("le loyer de novembre payé début décembre matche via la date de l'opération", () => {
    const prop = proposerPointages(
      [{ date: '2026-12-02', libelle: 'Cathelin', montant: -450 }],
      baux,
      '2026-12'
    )
    // Candidates : 2026-12 (absent) + 2026-11 (présent) → pointé pour novembre
    expect(prop[0].bailId).toBe(1)
    expect(prop[0].periode).toBe('2026-11')
  })

  it('montant sans correspondance = à revoir avec motif', () => {
    const prop = proposerPointages(
      [{ date: '2026-11-05', libelle: 'Courses', montant: -89.9 }],
      baux,
      '2026-11'
    )
    expect(prop[0].confiance).toBe('revoir')
    expect(prop[0].motif).toContain('Aucun loyer attendu')
  })

  it('règle mémorisée : libellé reconnu sans nom dans le libellé = confiance haute', () => {
    // Le libellé « Virement mensualite 4521 » ne contient aucun nom.
    const prop = proposerPointages(
      [{ date: '2026-11-03', libelle: 'Virement mensualite 4521', montant: -450 }],
      baux,
      '2026-11',
      { 'virement mensualite': 2 } // clé mémorisée → bail 2 (Élodie Moreau)
    )
    expect(prop[0].bailId).toBe(2)
    expect(prop[0].confiance).toBe('haute')
    expect(prop[0].motif).toContain('Règle mémorisée')
  })

  it("règle mémorisée : lève l'ambiguïté de montant (2 baux à 450 €)", () => {
    const prop = proposerPointages(
      [{ date: '2026-11-03', libelle: 'Virement mensualite', montant: -450 }],
      baux,
      '2026-11',
      { 'virement mensualite': 1 }
    )
    expect(prop[0].bailId).toBe(1)
    expect(prop[0].confiance).toBe('haute')
  })

  it('règle mémorisée ignorée si le montant ne colle plus (loyer révisé)', () => {
    const prop = proposerPointages(
      [{ date: '2026-11-03', libelle: 'Virement mensualite', montant: -465 }],
      baux,
      '2026-11',
      { 'virement mensualite': 1 }
    )
    expect(prop[0].bailId).toBeNull()
    expect(prop[0].confiance).toBe('revoir')
  })

  it('cleRegle : chiffres et ponctuation retirés, casse/accents normalisés', () => {
    expect(cleRegle('Virement LOYER Cathelin-Jean 03/11/2026')).toBe('virement loyer cathelin jean')
    expect(cleRegle('   PRÉLÈVEMENT 4521 loyer...  ')).toBe('prelevement loyer')
  })

  it("tolère l'écart d'un centime (arrondis bancaires)", () => {
    const solo: BailPourRapprochement[] = [
      {
        bailId: 9,
        locataire: 'Zoe Test',
        designation: 'X',
        attendusParPeriode: [{ periode: '2026-11', montant: 500.0 }]
      }
    ]
    const prop = proposerPointages(
      [{ date: '2026-11-03', libelle: 'Zoe', montant: -500.009 }],
      solo,
      '2026-11'
    )
    expect(prop[0].bailId).toBe(9)
  })
})
