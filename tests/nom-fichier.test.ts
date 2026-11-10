import { describe, it, expect } from 'vitest'
import {
  slugNomFichier,
  slugOuDefaut,
  nomFichierDecompte,
  nomFichierRecap2044
} from '../shared/nom-fichier'

describe('slugNomFichier', () => {
  it('retire accents et caractères spéciaux', () => {
    expect(slugNomFichier('Élodie Durand-Étienne')).toBe('Elodie_Durand_Etienne')
    expect(slugNomFichier("Jean d'Arc")).toBe('Jean_d_Arc')
    expect(slugNomFichier('  Lucie   Martin  ')).toBe('Lucie_Martin')
  })

  it('retourne une chaîne vide si rien d’exploitable', () => {
    expect(slugNomFichier('')).toBe('')
    expect(slugNomFichier(' ,,, ')).toBe('')
    expect(slugNomFichier('---')).toBe('')
  })

  it('réduit les lettres accentuées à leur équivalent ASCII', () => {
    expect(slugNomFichier('éà')).toBe('ea')
  })
})

describe('slugOuDefaut', () => {
  it('utilise le repli quand le slug est vide', () => {
    expect(slugOuDefaut('', 'bail')).toBe('bail')
    expect(slugOuDefaut(' , ', 'bail')).toBe('bail')
  })

  it('garde le slug sinon', () => {
    expect(slugOuDefaut('Élodie', 'bail')).toBe('Elodie')
  })
})

describe('nomFichierDecompte', () => {
  it('compose un nom sûr avec le locataire et l’année', () => {
    expect(nomFichierDecompte('Élodie Durand', 2025)).toBe(
      'regularisation_charges_Elodie_Durand_2025.pdf'
    )
  })

  it('replie sur « bail » quand le locataire est vide', () => {
    expect(nomFichierDecompte('', 2025)).toBe('regularisation_charges_bail_2025.pdf')
  })
})

describe('nomFichierRecap2044', () => {
  it('compose recap_2044_<annee>.pdf', () => {
    expect(nomFichierRecap2044(2025)).toBe('recap_2044_2025.pdf')
  })
})
