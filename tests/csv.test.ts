import { describe, it, expect } from 'vitest'
import { parseCsv, frNombre, frDate, csvCell, versCsv } from '../shared/csv'

describe('parseCsv', () => {
  it('découpe les lignes et colonnes simples', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3']
    ])
  })

  it('gère les guillemets et virgules embarquées', () => {
    expect(parseCsv('"Dupont, Jean",42')).toEqual([['Dupont, Jean', '42']])
  })

  it('gère les guillemets doublés et retours à la ligne dans une cellule', () => {
    const res = parseCsv('"ligne1\nligne2","dis ""bonjour"""')
    expect(res[0][0]).toBe('ligne1\nligne2')
    expect(res[0][1]).toBe('dis "bonjour"')
  })

  it('gère le CRLF Windows', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
  })
})

describe('frNombre', () => {
  it('convertit les montants en euros français', () => {
    expect(frNombre('19,12 €')).toBe(19.12)
    expect(frNombre('7 868,55 €')).toBe(7868.55)
    expect(frNombre('7\u202F868,55 €')).toBe(7868.55) // espace fine typographique
    expect(frNombre('650,00 €')).toBe(650)
  })

  it('convertit les pourcentages', () => {
    expect(frNombre('0,879%')).toBe(0.879)
  })

  it('retourne null pour vide ou illisible', () => {
    expect(frNombre('')).toBeNull()
    expect(frNombre(null)).toBeNull()
    expect(frNombre('   ')).toBeNull()
    expect(frNombre('abc')).toBeNull()
  })
})

describe('frDate', () => {
  it('convertit jj/mm/aaaa vers ISO', () => {
    expect(frDate('19/10/2024')).toBe('2024-10-19')
    expect(frDate('01/03/2025')).toBe('2025-03-01')
  })

  it('retourne null si pas une date', () => {
    expect(frDate('')).toBeNull()
    expect(frDate('n/a')).toBeNull()
    expect(frDate(null)).toBeNull()
  })
})

describe('csvCell / versCsv', () => {
  it('échappe séparateur, guillemets et retours à la ligne', () => {
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('dis "salut"')).toBe('"dis ""salut"""')
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(650.5)).toBe('650.5')
  })

  it('produit un CSV Excel-fr avec BOM et séparateur ;', () => {
    const csv = versCsv(['nom', 'loyer'], [['Dupont', 650]])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('nom;loyer')
    expect(csv).toContain('Dupont;650')
  })
})
