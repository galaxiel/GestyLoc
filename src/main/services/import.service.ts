import { dialog, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { getRawConnection } from '../database/connection'
import { parseCsv, frNombre, frDate } from '@shared/csv'
import type { TypeBien } from '@shared/types'

const TYPES_VALIDES: TypeBien[] = ['Appartement', 'Maison', 'Garage', 'Parking', 'Local', 'Studio', 'Autre']

// Lignes à ignorer dans un tableur type Google Sheet : en-tête, totaux,
// blocs de synthèse.
const LIGNE_IGNOREE = /^(Total|Type de Bien|Appartements|Garages|Colonne|ID)/i

/** Format attendu : l'export CSV du tableur de l'utilisateur (colonnes connues). */
export interface ImportPreview {
  nbLignes: number
  apercu: { designation: string; type_bien: string; locataire: string; loyer_cc: number | null }[]
  erreur: string | null
}

/**
 * Analyse un CSV (via boîte de sélection) et retourne un aperçu SANS rien
 * écrire en base. Mapping par INDEX de colonnes (format du tableur connu) :
 * 0 ID, 1 Type, 2 Locataire, 3 Date bail, 4 Fin bail, 6 Trimestre, 7 Meublé,
 * 8 Surface, 9 Loyer/m², 10 Loyer HC, 11 Charges, 12 Loyer CC, 13 IRL ref,
 * 14 IRL nouveau, 15 Taux, 16 Nouveau HC, 18 Annuel HC, 19 Annuel CC, 20 Frais.
 */
export async function previewImport(): Promise<ImportPreview> {
  const win = BrowserWindow.getAllWindows()[0]
  const res = await dialog.showOpenDialog(win, {
    title: 'Sélectionner le fichier CSV à importer',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (res.canceled || res.filePaths.length === 0) {
    return { nbLignes: 0, apercu: [], erreur: null }
  }
  try {
    const contenu = await readFile(res.filePaths[0], 'utf-8')
    const lignes = parseCsv(contenu)
    const utiles = lignes.filter((l) => {
      const id = (l[0] ?? '').trim()
      return id !== '' && !LIGNE_IGNOREE.test(id) && (l[2] ?? '').trim() !== ''
    })
    return {
      nbLignes: utiles.length,
      apercu: utiles.slice(0, 5).map((l) => ({
        designation: (l[0] ?? '').trim(),
        type_bien: (l[1] ?? '').trim(),
        locataire: (l[2] ?? '').trim(),
        loyer_cc: frNombre(l[12])
      })),
      erreur: utiles.length === 0 ? 'Aucune ligne exploitable trouvée dans ce fichier.' : null
    }
  } catch (err) {
    return {
      nbLignes: 0,
      apercu: [],
      erreur: err instanceof Error ? err.message : String(err)
    }
  }
}

/** Résultat du commit d'import. */
export interface ImportResult {
  baux: number
  biens: number
  locataires: number
  ignores: number
}

/**
 * Exécute l'import réel : 1 bien par ligne (plusieurs garages peuvent partager
 * une adresse), locataires dédoublonnés par nom exact, anti-doublon global
 * (refus si la base contient déjà des baux).
 */
export async function commitImport(): Promise<ImportResult> {
  const win = BrowserWindow.getAllWindows()[0]
  const res = await dialog.showOpenDialog(win, {
    title: 'Confirmer : sélectionner le même fichier CSV pour lancer l’import',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (res.canceled || res.filePaths.length === 0) {
    return { baux: 0, biens: 0, locataires: 0, ignores: 0 }
  }

  const db = getRawConnection()
  const existants = db.prepare("SELECT COUNT(*) AS n FROM baux").get() as { n: number }
  if (existants.n > 0) {
    throw new Error(
      `La base contient déjà ${existants.n} bail(s). L'import n'est autorisé que sur une base vide pour éviter les doublons.`
    )
  }

  const contenu = await readFile(res.filePaths[0], 'utf-8')
  const lignes = parseCsv(contenu)

  const insBien = db.prepare(
    'INSERT INTO biens (type_bien, designation, surface_m2, meuble, adresse, ville) VALUES (?,?,?,?,?,?)'
  )
  const insLoc = db.prepare('INSERT INTO locataires (nom_complet) VALUES (?)')
  const insBail = db.prepare(
    `INSERT INTO baux (bien_id, locataire_id, date_debut_bail, date_fin_bail,
     trimestre_reference, loyer_hc, charges, loyer_cc, loyer_metre_carre_hc,
     loyer_annuel_hc, loyer_annuel_cc, irl_reference, irl_nouveau, taux_irl,
     nouveau_loyer_hc, frais_agence, actif, occupation_gratuite)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )

  let nbBaux = 0
  let nbIgnores = 0
  const locatairesIds = new Map<string, number>()

  const importer = db.transaction(() => {
    for (const l of lignes) {
      const id = (l[0] ?? '').trim()
      const locataire = (l[2] ?? '').trim()
      if (id === '' || LIGNE_IGNOREE.test(id) || locataire === '') {
        nbIgnores++
        continue
      }

      const typeBrut = (l[1] ?? '').trim()
      const type = (TYPES_VALIDES.find(
        (t) => t.toLowerCase() === typeBrut.toLowerCase()
      ) ?? 'Autre') as TypeBien

      // Heuristique adresse : si la désignation contient un chiffre (n° de rue),
      // on la réutilise comme adresse (le tableur confondait souvent les deux).
      const contientNumero = /\d/.test(id)
      const bienId = insBien.run(
        type,
        id,
        frNombre(l[8]),
        /true/i.test(l[7] ?? '') ? 1 : 0,
        contientNumero ? id : null,
        contientNumero ? id : null
      ).lastInsertRowid as number

      let locId = locatairesIds.get(locataire)
      if (!locId) {
        locId = insLoc.run(locataire).lastInsertRowid as number
        locatairesIds.set(locataire, locId)
      }

      const hc = frNombre(l[10])
      const charges = frNombre(l[11])
      const surface = frNombre(l[8])
      const cc = hc !== null ? Math.round((hc + (charges ?? 0)) * 100) / 100 : null
      // Champs DÉRIVÉS recalculés (jamais recopiés du tableur) :
      const arrondi = (v: number | null): number | null =>
        v !== null ? Math.round(v * 100) / 100 : null
      const annuelHc = arrondi(hc !== null ? hc * 12 : null)
      const annuelCc = arrondi(cc !== null ? cc * 12 : null)
      const loyerM2 = arrondi(hc !== null && surface ? hc / surface : null)
      insBail.run(
        bienId,
        locId,
        frDate(l[3]),
        frDate(l[4]),
        (l[6] ?? '').trim() || null,
        hc,
        charges,
        cc,
        loyerM2,
        annuelHc,
        annuelCc,
        frNombre(l[13]),
        frNombre(l[14]),
        // Taux recalculé de la paire IRL (jamais recopié)
        (() => {
          const ref = frNombre(l[13])
          const nouv = frNombre(l[14])
          return ref && nouv && ref > 0
            ? Math.round((nouv / ref - 1) * 100000) / 1000
            : null
        })(),
        frNombre(l[16]),
        frNombre(l[20]),
        1,
        0
      )
      nbBaux++
    }
  })
  importer()

  return {
    baux: nbBaux,
    biens: (db.prepare('SELECT COUNT(*) AS n FROM biens').get() as { n: number }).n,
    locataires: (db.prepare('SELECT COUNT(*) AS n FROM locataires').get() as { n: number }).n,
    ignores: nbIgnores
  }
}
