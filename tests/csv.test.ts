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

  it('détecte le séparateur point-virgule (export Excel-fr)', () => {
    expect(parseCsv('nom;loyer;charges\nDupont;650;50')).toEqual([
      ['nom', 'loyer', 'charges'],
      ['Dupont', '650', '50']
    ])
  })

  it('stripe le BOM UTF-8 écrit par Excel (l\'en-tête ne devient pas "\\uFEFFID")', () => {
    const res = parseCsv('\uFEFFID;nom\n1;X')
    expect(res[0][0]).toBe('ID')
  })

  it('respecte un séparateur forcé', () => {
    expect(parseCsv('a,b;c', ';')).toEqual([['a,b', 'c']])
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

  it('retourne null pour une date sémantiquement invalide (pas de date fantôme)', () => {
    expect(frDate('31/02/2024')).toBeNull()
    expect(frDate('39/13/2024')).toBeNull()
    expect(frDate('00/05/2024')).toBeNull()
  })
})

describe('csvCell / versCsv', () => {
  it('échappe séparateur, guillemets et retours à la ligne', () => {
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('dis "salut"')).toBe('"dis ""salut"""')
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"')
    expect(csvCell('l1\rl2')).toBe('"l1\rl2"')
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

// ============================================================================
// Priorité 4 — aller-retour export → import = IDENTITÉ : ce que l'export
// écrit (versCsv, Excel-fr ; + BOM), le parseur doit le relire à l'identique
// (parseCsv + frNombre + frDate). C'est le contrat export ↔ import.
// ============================================================================

import { versCsv as versCsvExport } from '../shared/csv'

describe('aller-retour export → import (contrat export ↔ import)', () => {
  it('baux : désignation avec ; et virgules décimales survit au round-trip', () => {
    const ligne = [
      'Appartement T3; étage 2',
      'Appartement',
      'Jean Dupont',
      '15/03/2023',
      '31/03/2026',
      '',
      'T1 2023',
      'false',
      '65.5',
      '10.2',
      '500',
      '60',
      '560',
      '141.03',
      '144.51',
      '2.468',
      '510',
      '',
      '6000',
      '6720',
      '1200'
    ]
    const csv = versCsvExport(['ID', 'Type'], [ligne.slice(0, 2)])
    const relu = parseCsv(csv)
    expect(relu[1]).toEqual(ligne.slice(0, 2))
  })

  it('montants : versCsv → parseCsv → frNombre = valeur d origine', () => {
    // En-têtes multi-colonnes comme l'export réel (paiements) : la détection
    // de séparateur se fait sur la première ligne.
    const montants = [500, 60, 560, 650.5, 0.01, 1200.25, 7868.55]
    const lignes = montants.map((m) => [
      '1',
      '2026-11',
      String(m),
      '2026-11-03',
      'paye',
      'Virement',
      ''
    ])
    const csv = versCsvExport(
      [
        'bail_id',
        'periode',
        'montant_paye',
        'date_paiement',
        'statut',
        'mode_paiement',
        'reference'
      ],
      lignes
    )
    const relus = parseCsv(csv).slice(1)
    expect(relus.map((l) => frNombre(l[2]))).toEqual(montants)
  })

  it('dates : versCsv → parseCsv → frDate = ISO d origine', () => {
    const dates = ['2023-03-15', '2026-02-28', '2024-02-29']
    const fr = dates.map((d) => d.split('-').reverse().join('/'))
    const lignes = fr.map((d) => ['1', d, '450', '', 'paye', '', ''])
    const csv = versCsvExport(
      [
        'bail_id',
        'date_paiement',
        'montant_paye',
        'periode',
        'statut',
        'mode_paiement',
        'reference'
      ],
      lignes
    )
    const relus = parseCsv(csv).slice(1)
    expect(relus.map((l) => frDate(l[1]))).toEqual(dates)
  })

  it('cellules avec retour à la ligne (notes) : round-trip exact', () => {
    const notes = 'Ligne 1\nLigne 2; avec point-virgule\net "guillemets"'
    const csv = versCsvExport(['notes'], [[notes]])
    const relu = parseCsv(csv)
    expect(relu[1][0]).toBe(notes)
  })

  it('BOM + séparateur ; : le propre export de l app se relit sans ambiguïté', () => {
    const csv = versCsv(['a', 'b'], [['1', '2']])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(parseCsv(csv)).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })
})
