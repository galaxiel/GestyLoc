import { describe, it, expect } from 'vitest'
import { calculerRecap2044, SEUIL_MICRO_FONCIER, type PaiementFiscal } from '../shared/fiscalite'

const P = (
  bail_id: number,
  periode: string,
  statut: string,
  montant_paye: number
): PaiementFiscal => ({
  bail_id,
  periode,
  statut,
  montant_paye
})

describe('calculerRecap2044', () => {
  it('somme les recettes de l’année, hors autres années et baux meublés', () => {
    const r = calculerRecap2044(
      [
        P(1, '2025-01', 'paye', 700),
        P(1, '2025-02', 'partiel', 300),
        P(2, '2025-03', 'paye', 500), // meublé → exclu
        P(1, '2024-12', 'paye', 700), // autre année → exclu
        P(1, '2025-04', 'impaye', 700) // non pointé payé → exclu
      ],
      [],
      new Set([2]),
      2025
    )
    expect(r.recettes).toBe(1000)
    expect(r.recettesParBail).toEqual([{ bail_id: 1, recettes: 1000 }])
  })

  it('déduit toutes les dépenses datées de l’année', () => {
    const r = calculerRecap2044(
      [P(1, '2025-01', 'paye', 2000)],
      [
        { date_depense: '2025-05-10', montant: 400 },
        { date_depense: '2025-09-01', montant: 100 },
        { date_depense: '2024-05-10', montant: 999 }, // autre année
        { date_depense: null, montant: 999 } // sans date
      ],
      new Set(),
      2025
    )
    expect(r.chargesDeductibles).toBe(500)
    expect(r.resultat).toBe(1500)
  })

  it('bascule micro-foncier → réel au seuil de 15 000 € (inclusif)', () => {
    const auSeuil = calculerRecap2044(
      [P(1, '2025-01', 'paye', SEUIL_MICRO_FONCIER)],
      [],
      new Set(),
      2025
    )
    expect(auSeuil.microFoncier).toBe(true)
    expect(auSeuil.netMicro).toBe(10500)

    const auDessus = calculerRecap2044(
      [P(1, '2025-01', 'paye', SEUIL_MICRO_FONCIER + 0.01)],
      [],
      new Set(),
      2025
    )
    expect(auDessus.microFoncier).toBe(false)
  })

  it('borne le net réel à 0 et signale le déficit (résultat négatif)', () => {
    const r = calculerRecap2044(
      [P(1, '2025-01', 'paye', 100)],
      [{ date_depense: '2025-02-01', montant: 900 }],
      new Set(),
      2025
    )
    expect(r.resultat).toBe(-800)
    expect(r.netReel).toBe(0)
  })

  it('ventile les recettes par bail, décroissantes', () => {
    const r = calculerRecap2044(
      [P(1, '2025-01', 'paye', 300), P(2, '2025-01', 'paye', 900), P(1, '2025-02', 'paye', 300)],
      [],
      new Set(),
      2025
    )
    expect(r.recettesParBail).toEqual([
      { bail_id: 2, recettes: 900 },
      { bail_id: 1, recettes: 600 }
    ])
  })

  it('année sans aucune donnée : tout à zéro, micro-foncier', () => {
    const r = calculerRecap2044([], [], new Set(), 2030)
    expect(r).toMatchObject({
      recettes: 0,
      chargesDeductibles: 0,
      resultat: 0,
      microFoncier: true,
      netMicro: 0,
      netReel: 0
    })
    expect(r.recettesParBail).toEqual([])
  })
})
