import { describe, it, expect } from 'vitest'
import { nomBien, libelleBien, triParLibelle } from '../shared/labels'

// Libellés canoniques : tout affichage passe par ici — un libellé erroné
// rend les tableaux inutilisables dans un parc où plusieurs garages
// partagent la même adresse.

describe('nomBien', () => {
  it('préfère le « nom » lisible s il existe (même non vide avec espaces)', () => {
    expect(
      nomBien({ type_bien: 'Garage', designation: '11 rue renoir', nom: 'Garage renoir n°1' })
    ).toBe('Garage renoir n°1')
  })
  it('retombe sur la désignation si nom vide ou null', () => {
    expect(nomBien({ type_bien: 'Garage', designation: '11 rue renoir', nom: null })).toBe(
      '11 rue renoir'
    )
    expect(nomBien({ type_bien: 'Garage', designation: '11 rue renoir', nom: '   ' })).toBe(
      '11 rue renoir'
    )
  })
  it('sans nom du tout : la désignation seule', () => {
    expect(nomBien({ type_bien: 'Studio', designation: 'Studio Rdc' })).toBe('Studio Rdc')
  })
})

describe('libelleBien', () => {
  it('format canonique « Type · Nom — Locataire »', () => {
    expect(
      libelleBien({
        type_bien: 'Garage',
        designation: '11 rue renoir',
        nom: 'Garage renoir n°1',
        locataire: 'M. Cathelin'
      })
    ).toBe('Garage · Garage renoir n°1 — M. Cathelin')
  })
  it('sans locataire : pas de séparateur final', () => {
    expect(libelleBien({ type_bien: 'Studio', designation: 'Studio Rdc' })).toBe(
      'Studio · Studio Rdc'
    )
  })
  it('type vide : pas de préfixe orphelin', () => {
    expect(libelleBien({ type_bien: '', designation: 'Bien orphelin', locataire: 'X' })).toBe(
      'Bien orphelin — X'
    )
  })
})

describe('triParLibelle', () => {
  it('tri stable par libellé (localeCompare) sans muter l entrée', () => {
    const biens = [
      { nom: 'Garage B', loc: 'Z' },
      { nom: 'Garage A', loc: 'Y' },
      { nom: 'Garage A', loc: 'B' }
    ]
    const libelle = (b: { nom: string; loc: string }): string => `${b.nom} — ${b.loc}`
    const trie = triParLibelle(biens, libelle)
    expect(trie.map((b) => libelle(b))).toEqual(['Garage A — B', 'Garage A — Y', 'Garage B — Z'])
    // L'entrée d'origine n'est pas mutée (le tri retourne une copie).
    expect(biens.map((b) => libelle(b))).toEqual(['Garage B — Z', 'Garage A — Y', 'Garage A — B'])
  })
})
