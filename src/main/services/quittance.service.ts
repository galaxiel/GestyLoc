import { dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs'
import { promisify } from 'util'
import { getRawConnection } from '../database/connection'
import type { QuittanceHistorique } from '@shared/types'

const writeFileAsync = promisify(writeFile)

/**
 * Sauvegarde d'une quittance générée côté renderer (pdfmake → base64).
 * Le main ouvre la boîte "Enregistrer sous" et écrit le fichier.
 */
import { referenceQuittance } from '@shared/quittance-ref'

export { referenceQuittance }

/** Trace une quittance générée dans l'historique (upsert par bail+période). */
export function enregistrerQuittance(
  bailId: number,
  periode: string,
  nomFichier: string,
  chemin: string | null,
  reference: string
): void {
  getRawConnection()
    .prepare(
      `INSERT INTO quittances (bail_id, periode, reference_number, nom_fichier, chemin, genere_le)
       VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(bail_id, periode) DO UPDATE SET
         reference_number = excluded.reference_number,
         nom_fichier = excluded.nom_fichier,
         chemin = excluded.chemin,
         genere_le = CURRENT_TIMESTAMP`
    )
    .run(bailId, periode, reference, nomFichier, chemin)
}

/** Historique des quittances générées. */
export function listQuittances(): QuittanceHistorique[] {
  return getRawConnection()
    .prepare('SELECT id, bail_id, periode, reference_number, nom_fichier, chemin, genere_le FROM quittances ORDER BY genere_le DESC')
    .all() as QuittanceHistorique[]
}

export async function saveQuittancePdf(base64: string, nomSuggere: string): Promise<string | null> {
  const win = BrowserWindow.getAllWindows()[0]
  const result = await dialog.showSaveDialog(win, {
    title: 'Enregistrer la quittance de loyer',
    defaultPath: nomSuggere,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return null

  const buffer = Buffer.from(base64, 'base64')
  await writeFileAsync(result.filePath, buffer)
  return result.filePath
}

export async function saveToDossierTrace(
  base64: string,
  dossier: string,
  nomFichier: string,
  bailId: number,
  periode: string,
  reference: string
): Promise<string> {
  const chemin = await saveToDossier(base64, dossier, nomFichier)
  enregistrerQuittance(bailId, periode, nomFichier, chemin, reference)
  return chemin
}

/**
 * Générations en lot : choisit UN dossier, puis chaque quittance y est écrite
 * directement (l'appelleur renderer boucle sur les baux).
 */
export async function choisirDossierQuittances(): Promise<string | null> {
  const win = BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, {
    title: 'Choisir le dossier où enregistrer toutes les quittances',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

/** Écrit un PDF base64 dans un dossier déjà choisi (retourne le chemin). */
export async function saveToDossier(base64: string, dossier: string, nomFichier: string): Promise<string> {
  const chemin = `${dossier}\\${nomFichier}`.replace(/\//g, '\\')
  const buffer = Buffer.from(base64, 'base64')
  await writeFileAsync(chemin, buffer)
  return chemin
}
