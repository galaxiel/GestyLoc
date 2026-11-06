import { describe, it, expect } from 'vitest'
import {
  formatEuro,
  formatDate,
  formatSurface,
  formatPeriode,
  periodeCourante,
  libelleStatut
} from '../src/renderer/src/lib/format'

// Formatage fr-FR affiché sur TOUS les écrans : un séparateur cassé rend
// les montants illisibles ou trompeurs.

describe('formatEuro', () => {
  it('montants en euros fr-FR (espace insécable avant € selon ICU)', () => {
    const s = formatEuro(650.5).replace(/[\u00a0\u202f]/g, ' ')
    expect(s).toBe('650,50 €')
  })
  it('null/undefined → tiret cadratins (jamais « NaN € » ni « 0 € »)', () => {
    expect(formatEuro(null)).toBe('—')
    expect(formatEuro(undefined)).toBe('—')
  })
  it('zéro est affiché (0 € ≠ pas de donnée)', () => {
    expect(formatEuro(0).replace(/[\u00a0\u202f]/g, ' ')).toBe('0,00 €')
  })
})

describe('formatDate', () => {
  it('ISO → jj/mm/aaaa', () => {
    expect(formatDate('2026-03-15')).toBe('15/03/2026')
  })
  it('null → tiret', () => {
    expect(formatDate(null)).toBe('—')
  })
  it('format non ISO : rendu tel quel (pas de crash)', () => {
    expect(formatDate('bientôt')).toBe('bientôt')
  })
})

describe('formatSurface', () => {
  it('m² avec séparateur de milliers fr', () => {
    expect(formatSurface(1250).replace(/[\u00a0\u202f]/g, ' ')).toBe('1 250 m²')
    expect(formatSurface(65.5)).toBe('65,5 m²')
  })
  it('null → tiret', () => {
    expect(formatSurface(null)).toBe('—')
  })
})

describe('formatPeriode', () => {
  it("'yyyy-mm' → « mois année » en français", () => {
    expect(formatPeriode('2026-11')).toBe('novembre 2026')
    expect(formatPeriode('2026-01')).toBe('janvier 2026')
    expect(formatPeriode('2026-08')).toBe('août 2026')
  })
  it('période illisible → rendue telle quelle', () => {
    expect(formatPeriode('voilà')).toBe('voilà')
  })
})

describe('periodeCourante', () => {
  it('format yyyy-mm avec mois sur 2 chiffres', () => {
    expect(periodeCourante()).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('libelleStatut', () => {
  it('les 4 statuts connus ont un libellé français', () => {
    expect(libelleStatut('paye')).toBe('Payé')
    expect(libelleStatut('partiel')).toBe('Partiel')
    expect(libelleStatut('retard')).toBe('En retard')
    expect(libelleStatut('impaye')).toBe('Impayé')
  })
  it('statut inconnu : rendu brut (pas de undefined)', () => {
    expect(libelleStatut('bizarre')).toBe('bizarre')
  })
})
