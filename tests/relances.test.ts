import { describe, it, expect } from 'vitest'
import { templateRelance, libelleNiveau, type CtxRelance } from '../shared/relances'

const ctx: CtxRelance = {
  locataire: 'Jean Cathelin',
  designation: 'Garage renoir n°1',
  adresseBien: '11 rue Renoir',
  periode: 'novembre 2026',
  montantDu: 450,
  echeance: '05/11/2026',
  bailleur: 'Jeanne Bailleur'
}

describe('templateRelance', () => {
  it('niveau 1 courtois : rappel simple, ton aimable', () => {
    const r = templateRelance(1, ctx)
    expect(r.objet).toContain('Rappel')
    expect(r.corps).toContain('Bonjour Jean Cathelin')
    // NB : l'espace avant « € » varie selon l'ICU (fine U+202F ou insécable
    // U+00A0) — on normalise avant de comparer.
    expect(r.corps.replace(/[\u202f\u00a0]/g, ' ')).toContain('450,00 €')
    expect(r.corps).toContain('novembre 2026')
    expect(r.corps).toContain('05/11/2026')
    expect(r.corps).toContain('simple oubli')
    expect(r.corps).not.toContain('METTIONS EN DEMEURE')
  })

  it('niveau 2 ferme : délai de 8 jours, récidive', () => {
    const r = templateRelance(2, ctx)
    expect(r.corps).toContain('précédent rappel')
    expect(r.corps).toContain('sous 8 jours')
  })

  it('niveau 3 mise en demeure : formel, sans "Bonjour"', () => {
    const r = templateRelance(3, ctx)
    expect(r.objet).toContain('Mise en demeure')
    expect(r.corps).toContain('METTIONS EN DEMEURE')
    expect(r.corps).toContain('résiliation du bail')
    expect(r.corps).not.toContain('Bonjour')
  })

  it('les trois niveaux sont distincts et mentionnent bien/désignation', () => {
    const r1 = templateRelance(1, ctx)
    const r2 = templateRelance(2, ctx)
    const r3 = templateRelance(3, ctx)
    expect(r1.corps).not.toBe(r2.corps)
    expect(r2.corps).not.toBe(r3.corps)
    for (const r of [r1, r2, r3]) {
      expect(r.corps).toContain('Garage renoir n°1 (11 rue Renoir)')
      expect(r.corps).toContain('Jeanne Bailleur')
    }
  })
})

describe('libelleNiveau', () => {
  it('libellés affichés', () => {
    expect(libelleNiveau(1)).toContain('courtoise')
    expect(libelleNiveau(2)).toContain('ferme')
    expect(libelleNiveau(3)).toContain('Mise en demeure')
  })
})
