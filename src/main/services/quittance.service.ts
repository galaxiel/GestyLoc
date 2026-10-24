import { dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs'
import { promisify } from 'util'

const writeFileAsync = promisify(writeFile)

/**
 * Sauvegarde d'une quittance générée côté renderer (pdfmake → base64).
 * Le main ouvre la boîte "Enregistrer sous" et écrit le fichier.
 */
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
