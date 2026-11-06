import { describe, it, expect } from 'vitest'
import { IRL_INSEE, IRL_TRIMESTRES, valeurIrl } from '../shared/irl-insee'

// Priorité 1 (risque financier) : toute valeur IRL fausse ou trimestre mal
// trié change le loyer révisé au centime près. Les valeurs attendues sont
// des valeurs INSEE PUBLIQUES (source : la table elle-même + ANIL).

describe('IRL_INSEE — intégrité de la table embarquée', () => {
  it('clés au format canonique YYYY-Qn et valeurs numériques positives', () => {
    for (const [cle, valeur] of Object.entries(IRL_INSEE)) {
      expect(cle).toMatch(/^\d{4}-Q[1-4]$/)
      expect(valeur).toBeGreaterThan(0)
      expect(Number.isFinite(valeur)).toBe(true)
    }
  })

  it('base 100 : les premières valeurs gravitent autour de 100 (série IRL base 1998)', () => {
    expect(IRL_INSEE['2004-Q1']).toBe(107.8)
    expect(IRL_INSEE['2004-Q2']).toBe(108.28)
  })

  it('valeurs récentes recoupées avec les publications INSEE/ANIL', () => {
    expect(IRL_INSEE['2024-Q3']).toBe(144.51)
    expect(IRL_INSEE['2025-Q2']).toBe(146.68)
    expect(IRL_INSEE['2025-Q3']).toBe(145.77)
    expect(IRL_INSEE['2026-Q3']).toBe(148.06)
  })

  it('continuité trimestrielle : 91 trimestres de 2004-Q1 à 2026-Q3 sans trou', () => {
    const cles = Object.keys(IRL_INSEE)
    expect(cles.length).toBe(91)
    expect(cles[0]).toBe('2004-Q1')
    expect(cles.at(-1)).toBe('2026-Q3')
    // Pas de trimestre manquant : chaque clé suit la précédente (+1 trimestre).
    for (let i = 1; i < cles.length; i++) {
      const [aPrec, qPrec] = cles[i - 1].split('-Q').map(Number)
      const suivantAttendu = qPrec === 4 ? `${aPrec + 1}-Q1` : `${aPrec}-Q${qPrec + 1}`
      expect(cles[i]).toBe(suivantAttendu)
    }
  })

  it('variations trimestrielles plausibles (jamais > 5 % — une erreur de saisie se verrait)', () => {
    const cles = Object.keys(IRL_INSEE)
    for (let i = 1; i < cles.length; i++) {
      const variation = Math.abs(IRL_INSEE[cles[i]] / IRL_INSEE[cles[i - 1]] - 1)
      expect(variation).toBeLessThan(0.05)
    }
  })
})

describe('IRL_TRIMESTRES — ordre de la liste déroulante', () => {
  it('du plus récent au plus ancien, sans doublon', () => {
    expect(IRL_TRIMESTRES[0]).toBe('2026-Q3')
    expect(IRL_TRIMESTRES.at(-1)).toBe('2004-Q1')
    expect(new Set(IRL_TRIMESTRES).size).toBe(IRL_TRIMESTRES.length)
  })

  it('chaque trimestre de la liste existe dans la table (et inversement)', () => {
    expect(IRL_TRIMESTRES.length).toBe(Object.keys(IRL_INSEE).length)
    for (const q of IRL_TRIMESTRES) expect(valeurIrl(q)).not.toBeNull()
  })
})

describe('valeurIrl — lookup exact', () => {
  it('retourne la valeur exacte pour un trimestre connu', () => {
    expect(valeurIrl('2025-Q3')).toBe(145.77)
    expect(valeurIrl('2004-Q1')).toBe(107.8)
  })

  it('retourne null pour un trimestre inconnu (jamais 0 ni undefined)', () => {
    expect(valeurIrl('2026-Q4')).toBeNull() // non publié à la génération
    expect(valeurIrl('2003-Q4')).toBeNull() // avant la série
    expect(valeurIrl('nimporte-quoi')).toBeNull()
    expect(valeurIrl('2025-T3')).toBeNull() // mauvais séparateur (T vs Q)
  })
})
