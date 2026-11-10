import { describe, it, expect } from 'vitest'
import {
  SAUVEGARDE_AUTO_MAX,
  nomSauvegardeAuto,
  estSauvegardeAuto,
  rotationSauvegardes,
  sauvegardeDue
} from '../shared/sauvegarde'

describe('nomSauvegardeAuto', () => {
  it('formate auto_AAAA-MM-JJ_HHMMSS.db avec zéros de remplissage', () => {
    expect(nomSauvegardeAuto(new Date(2026, 0, 5, 8, 3, 7))).toBe('auto_2026-01-05_080307.db')
  })

  it('trie lexicalement dans l’ordre chronologique', () => {
    const a = nomSauvegardeAuto(new Date(2026, 10, 7, 9, 0, 0))
    const b = nomSauvegardeAuto(new Date(2026, 10, 7, 10, 0, 0))
    expect(a.localeCompare(b)).toBeLessThan(0)
  })
})

describe('estSauvegardeAuto', () => {
  it('accepte le format auto_*', () => {
    expect(estSauvegardeAuto('auto_2026-11-07_093000.db')).toBe(true)
  })

  it('refuse les autres fichiers de sauvegarde et les noms hors format', () => {
    expect(estSauvegardeAuto('avant_restauration_1730000000000.db')).toBe(false)
    expect(estSauvegardeAuto('avant_remise_a_zero_2026-11-07T09-00-00.db')).toBe(false)
    expect(estSauvegardeAuto('auto_2026-11-07.db')).toBe(false)
    expect(estSauvegardeAuto('auto_x.db')).toBe(false)
    expect(estSauvegardeAuto('sauvegarde.db')).toBe(false)
  })
})

describe('rotationSauvegardes', () => {
  const noms = [
    'auto_2026-09-01_120000.db',
    'auto_2026-10-01_120000.db',
    'auto_2026-10-20_120000.db',
    'auto_2026-11-01_120000.db',
    'auto_2026-11-05_120000.db',
    'auto_2026-11-06_120000.db',
    'auto_2026-11-07_120000.db'
  ]

  it('garde les 5 plus récentes et propose la suppression des plus anciennes', () => {
    const { aGarder, aSupprimer } = rotationSauvegardes(noms)
    expect(aGarder).toHaveLength(SAUVEGARDE_AUTO_MAX)
    expect(aGarder[0]).toBe('auto_2026-11-07_120000.db')
    expect(aGarder).not.toContain('auto_2026-10-01_120000.db')
    // Ordre du tri (décroissant) conservé : les plus récentes d'abord.
    expect(aSupprimer).toEqual(['auto_2026-10-01_120000.db', 'auto_2026-09-01_120000.db'])
  })

  it('ne touche jamais les fichiers hors format', () => {
    const { aGarder, aSupprimer } = rotationSauvegardes([
      ...noms,
      'avant_restauration_123.db',
      'gestyloc_sauvegarde.db'
    ])
    expect(aSupprimer).toHaveLength(2)
    expect(aGarder.join('|')).not.toContain('avant_')
    expect(aGarder.join('|')).not.toContain('gestyloc_sauvegarde')
  })

  it('ne supprime rien sous le maximum', () => {
    const { aGarder, aSupprimer } = rotationSauvegardes(noms.slice(0, 3))
    expect(aGarder).toHaveLength(3)
    expect(aSupprimer).toEqual([])
  })
})

describe('sauvegardeDue', () => {
  const maintenant = new Date(2026, 10, 7, 12, 0, 0)
  const jours = 24 * 60 * 60 * 1000

  it('due si jamais faite ou date illisible', () => {
    expect(sauvegardeDue(null, maintenant)).toBe(true)
    expect(sauvegardeDue(undefined, maintenant)).toBe(true)
    expect(sauvegardeDue('pas-une-date', maintenant)).toBe(true)
  })

  it('pas due avant 7 jours, due à 7 jours ou plus', () => {
    expect(
      sauvegardeDue(new Date(maintenant.getTime() - 6 * jours).toISOString(), maintenant)
    ).toBe(false)
    expect(
      sauvegardeDue(new Date(maintenant.getTime() - 7 * jours).toISOString(), maintenant)
    ).toBe(true)
    expect(
      sauvegardeDue(new Date(maintenant.getTime() - 30 * jours).toISOString(), maintenant)
    ).toBe(true)
  })

  it('pas due si l’horloge a reculé (date persistée dans le futur)', () => {
    expect(sauvegardeDue(new Date(maintenant.getTime() + jours).toISOString(), maintenant)).toBe(
      false
    )
  })
})
