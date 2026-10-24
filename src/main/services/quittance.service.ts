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
