import { describe, it, expect } from 'vitest'
import {
  joursDansMois,
  periodeDeDateIso,
  jourDeDateIso,
  joursOccupes,
  loyerCcPlein,
  montantAttendu,
  detailProrata,
  echeanceIso,
  joursDeRetard
} from '../shared/echeancier'

describe('joursDansMois', () => {
  it('gère les longueurs classiques', () => {
    expect(joursDansMois(2026, 1)).toBe(31)
    expect(joursDansMois(2026, 4)).toBe(30)
    expect(joursDansMois(2026, 2)).toBe(28)
  })
  it('gère le 29 février des années bissextiles', () => {
    expect(joursDansMois(2024, 2)).toBe(29)
  })
})

describe('parsing de dates', () => {
  it('periodeDeDateIso extrait yyyy-mm', () => {
    expect(periodeDeDateIso('2026-03-15')).toBe('2026-03')
    expect(periodeDeDateIso('2026-03')).toBe('2026-03')
    expect(periodeDeDateIso('')).toBeNull()
    expect(periodeDeDateIso(null)).toBeNull()
  })
  it('jourDeDateIso extrait le jour', () => {
    expect(jourDeDateIso('2026-03-15')).toBe(15)
    expect(jourDeDateIso('2026-03-01')).toBe(1)
    expect(jourDeDateIso('nimporte')).toBeNull()
  })
})

describe('joursOccupes', () => {
  it("compte le jour d'entrée comme occupé", () => {
    expect(joursOccupes(15, 2026, 4)).toBe(16) // avril : 30 - 15 + 1
    expect(joursOccupes(1, 2026, 1)).toBe(31) // entrée le 1er = mois plein
    expect(joursOccupes(31, 2026, 1)).toBe(1)
  })
  it('borne le jour au dernier du mois (31 en avril -> 30)', () => {
    expect(joursOccupes(31, 2026, 4)).toBe(1)
  })
})

describe('loyerCcPlein', () => {
  it('préfère loyer_cc', () => {
    expect(loyerCcPlein({ date_debut_bail: null, loyer_cc: 500, loyer_hc: 400, charges: 50 })).toBe(
      500
    )
  })
  it('retombe sur HC + charges', () => {
    expect(
      loyerCcPlein({ date_debut_bail: null, loyer_cc: null, loyer_hc: 400.5, charges: 50.25 })
    ).toBe(450.75)
  })
  it('null si rien de connu', () => {
    expect(
      loyerCcPlein({ date_debut_bail: null, loyer_cc: null, loyer_hc: null, charges: null })
    ).toBeNull()
  })
})

describe('montantAttendu (prorata du premier mois)', () => {
  const bail = {
    date_debut_bail: '2026-04-15',
    loyer_cc: 600,
    loyer_hc: null,
    charges: null
  }

  it("mois d'entrée : prorata jours civils (16/30 pour un 15 avril)", () => {
    expect(montantAttendu(bail, '2026-04')).toBe(320) // 600 × 16/30
  })
  it('mois suivants : loyer plein', () => {
    expect(montantAttendu(bail, '2026-05')).toBe(600)
    expect(montantAttendu(bail, '2027-04')).toBe(600)
  })
  it('entrée le 1er : pas de prorata', () => {
    expect(montantAttendu({ ...bail, date_debut_bail: '2026-04-01' }, '2026-04')).toBe(600)
  })
  it('arrondi au centime', () => {
    const b = { ...bail, loyer_cc: 500.05 }
    // 500.05 × 16/30 = 266.6933… -> 266.69
    expect(montantAttendu(b, '2026-04')).toBe(266.69)
  })
  it('février bissextile : 10 février -> 20/29', () => {
    const b = { ...bail, date_debut_bail: '2024-02-10', loyer_cc: 580 }
    expect(montantAttendu(b, '2024-02')).toBe(400) // 580 × 20/29 = 400
  })
  it('retombe sur HC + charges pour le prorata', () => {
    const b = { date_debut_bail: '2026-06-21', loyer_cc: null, loyer_hc: 300, charges: 100 }
    // 400 × 10/30 = 133.33
    expect(montantAttendu(b, '2026-06')).toBe(133.33)
  })
  it('null si aucun loyer connu', () => {
    expect(
      montantAttendu(
        { date_debut_bail: '2026-04-15', loyer_cc: null, loyer_hc: null, charges: null },
        '2026-04'
      )
    ).toBeNull()
  })
  it('période invalide : loyer plein', () => {
    expect(montantAttendu(bail, 'gibberish')).toBe(600)
  })
})

describe('detailProrata', () => {
  it('renvoie la fraction uniquement au premier mois', () => {
    const bail = { date_debut_bail: '2026-04-15', loyer_cc: 600, loyer_hc: null, charges: null }
    expect(detailProrata(bail, '2026-04')).toBe('16/30 j')
    expect(detailProrata(bail, '2026-05')).toBeNull()
  })
  it("null si l'entrée est le 1er", () => {
    expect(
      detailProrata(
        { date_debut_bail: '2026-04-01', loyer_cc: 600, loyer_hc: null, charges: null },
        '2026-04'
      )
    ).toBeNull()
  })
})

describe('echeanceIso', () => {
  it('retourne le jour de paiement', () => {
    expect(echeanceIso('2026-11', 5)).toBe('2026-11-05')
  })
  it('borne au dernier jour du mois (31 en avril)', () => {
    expect(echeanceIso('2026-04', 31)).toBe('2026-04-30')
  })
  it('défaut 1 si non renseigné', () => {
    expect(echeanceIso('2026-11', null)).toBe('2026-11-01')
  })
})

describe('joursDeRetard', () => {
  it('pas en retard avant le jour de paiement', () => {
    expect(joursDeRetard('2026-11', 5, 0, new Date(2026, 10, 3))).toBe(0)
    expect(joursDeRetard('2026-11', 5, 0, new Date(2026, 10, 5))).toBe(0)
  })
  it("retard à partir du lendemain de l'échéance", () => {
    expect(joursDeRetard('2026-11', 5, 0, new Date(2026, 10, 6))).toBe(1)
    expect(joursDeRetard('2026-11', 5, 0, new Date(2026, 10, 10))).toBe(5)
  })
  it('la marge repousse le déclenchement', () => {
    expect(joursDeRetard('2026-11', 5, 3, new Date(2026, 10, 7))).toBe(0)
    expect(joursDeRetard('2026-11', 5, 3, new Date(2026, 10, 9))).toBe(4)
  })
})
