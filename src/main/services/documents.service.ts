import { dialog, shell, BrowserWindow } from 'electron'
import { copyFileSync, mkdirSync, existsSync, unlinkSync, statSync } from 'fs'
import { join, basename } from 'path'
import { app } from 'electron'
import { getDb } from '../database/connection'
import { documents } from '../database/schema'
import { eq } from 'drizzle-orm'
import type { DocumentRow, TypeDocument } from '@shared/types'

/**
 * Service de stockage de documents : les fichiers (baux, états des lieux...)
 * sont copiés dans AppData/documents/<bailId>/ et seul le chemin est en BDD.
 */
export const documentsService = {
  /** Ouvre une boîte de sélection, copie le fichier choisi, l'enregistre en BDD. */
  async selectAndAttach(
    bailId: number,
    typeDocument: TypeDocument
  ): Promise<DocumentRow | null> {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Sélectionner un document à joindre',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const sourcePath = result.filePaths[0]
    return this.attach(bailId, typeDocument, sourcePath)
  },

  /** Copie un fichier local vers AppData et crée l'entrée BDD. */
  attach(bailId: number, typeDocument: TypeDocument, sourcePath: string): DocumentRow {
    const destDir = join(app.getPath('userData'), 'documents', `bail_${bailId}`)
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true })
    }

    // Préfixe horodaté pour éviter les collisions de noms.
    const stamp = Date.now()
    const destPath = join(destDir, `${stamp}_${basename(sourcePath)}`)
    copyFileSync(sourcePath, destPath)

    const taille = statSync(destPath).size
    return getDb()
      .insert(documents)
      .values({
        bail_id: bailId,
        nom_original: basename(sourcePath),
        chemin_stockage: destPath,
        type_document: typeDocument,
        taille_octets: taille
      })
      .returning()
      .get() as DocumentRow
  },

  /** Variante : rattacher un document directement au BIEN (diagnostics, travaux...). */
  async selectAndAttachToBien(
    bienId: number,
    typeDocument: TypeDocument
  ): Promise<DocumentRow | null> {
    const win = BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Sélectionner un document à joindre au bien',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const sourcePath = result.filePaths[0]

    const destDir = join(app.getPath('userData'), 'documents', `bien_${bienId}`)
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true })
    }
    const stamp = Date.now()
    const destPath = join(destDir, `${stamp}_${basename(sourcePath)}`)
    copyFileSync(sourcePath, destPath)

    const taille = statSync(destPath).size
    return getDb()
      .insert(documents)
      .values({
        bien_id: bienId,
        nom_original: basename(sourcePath),
        chemin_stockage: destPath,
        type_document: typeDocument,
        taille_octets: taille
      })
      .returning()
      .get() as DocumentRow
  },

  listByBien(bienId: number): DocumentRow[] {
    return getDb()
      .select()
      .from(documents)
      .where(eq(documents.bien_id, bienId))
      .all() as DocumentRow[]
  },

  listByBail(bailId: number): DocumentRow[] {
    return getDb()
      .select()
      .from(documents)
      .where(eq(documents.bail_id, bailId))
      .all() as DocumentRow[]
  },

  listAll(): DocumentRow[] {
    return getDb().select().from(documents).all() as DocumentRow[]
  },

  /** Ouvre le fichier avec l'application par défaut de l'OS. */
  async open(documentId: number): Promise<boolean> {
    const doc = getDb().select().from(documents).where(eq(documents.id, documentId)).get()
    if (!doc) return false
    const errorMessage = await shell.openPath(doc.chemin_stockage)
    return errorMessage === ''
  },

  /** Supprime le fichier sur disque ET l'entrée BDD. */
  delete(documentId: number): void {
    const doc = getDb().select().from(documents).where(eq(documents.id, documentId)).get()
    if (doc && existsSync(doc.chemin_stockage)) {
      try {
        unlinkSync(doc.chemin_stockage)
      } catch {
        // Fichier verrouillé par l'OS : on supprime quand même l'entrée BDD.
      }
    }
    getDb().delete(documents).where(eq(documents.id, documentId)).run()
  }
}
