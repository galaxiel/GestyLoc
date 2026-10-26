import { dialog, BrowserWindow, app } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import { getDbPath, getRawConnection, closeDb } from '../database/connection'
import { versCsv } from '@shared/csv'
import { bailRepository } from '../repositories/bail.repository'
import { bienRepository } from '../repositories/bien.repository'
import { locataireRepository } from '../repositories/locataire.repository'
import { paiementRepository } from '../repositories/paiement.repository'
import { listQuittances } from './quittance.service'
import log from 'electron-log'

// ----------------------------------------------------------------------------
// Export CSV : toutes les tables dans un dossier choisi (Excel-fr ; + BOM).
// ----------------------------------------------------------------------------
export async function exporterCsv(): Promise<string | null> {
  const win = BrowserWindow.getAllWindows()[0]
  const res = await dialog.showOpenDialog(win, {
    title: 'Choisir le dossier d’export',
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || res.filePaths.length === 0) return null
  const dossier = res.filePaths[0]

  const fichiers: string[] = []
  const ecrire = (nom: string, contenu: string): void => {
    const chemin = join(dossier, nom)
    // Sécurité anti-collision : suffixe horodaté.
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const final = existsSync(chemin) ? chemin.replace(/\.csv$/, `_${stamp}.csv`) : chemin
    require('fs').writeFileSync(final, contenu, 'utf-8')
    fichiers.push(basename(final))
  }

  ecrire(
    'biens.csv',
    versCsv(
      ['id', 'type_bien', 'designation', 'adresse', 'code_postal', 'ville', 'surface_m2', 'meuble'],
      bienRepository.list().map((b) => [
        b.id, b.type_bien, b.designation, b.adresse, b.code_postal, b.ville, b.surface_m2,
        b.meuble ? 'oui' : 'non'
      ])
    )
  )

  ecrire(
    'locataires.csv',
    versCsv(
      ['id', 'nom_complet', 'email', 'telephone', 'notes'],
      locataireRepository.list().map((l) => [l.id, l.nom_complet, l.email, l.telephone, l.notes])
    )
  )

  ecrire(
    'baux.csv',
    versCsv(
      ['id', 'bien', 'locataire', 'debut', 'fin', 'trimestre_ref', 'loyer_hc', 'charges',
       'loyer_cc', 'loyer_m2_hc', 'annuel_hc', 'annuel_cc', 'irl_ref', 'irl_nouveau', 'taux_irl',
       'nouveau_loyer_hc', 'frais_agence', 'actif', 'occupation_gratuite', 'derniere_revision'],
      bailRepository.listWithRelations().map((r) => [
        r.bail.id, r.bien.designation, r.locataire.nom_complet, r.bail.date_debut_bail,
        r.bail.date_fin_bail, r.bail.trimestre_reference, r.bail.loyer_hc, r.bail.charges,
        r.bail.loyer_cc, r.bail.loyer_metre_carre_hc, r.bail.loyer_annuel_hc,
        r.bail.loyer_annuel_cc, r.bail.irl_reference, r.bail.irl_nouveau, r.bail.taux_irl,
        r.bail.nouveau_loyer_hc, r.bail.frais_agence,
        r.bail.actif ? 'oui' : 'non',
        r.bail.occupation_gratuite ? 'oui' : 'non',
        r.bail.date_derniere_revision
      ])
    )
  )

  ecrire(
    'quittances.csv',
    versCsv(
      ['reference', 'periode', 'locataire', 'bien', 'fichier', 'genere_le'],
      listQuittances().map((q) => {
        const r = bailRepository.listWithRelations().find((x) => x.bail.id === q.bail_id)
        return [
          q.reference_number,
          q.periode,
          r?.locataire.nom_complet ?? '',
          r?.bien.designation ?? '',
          q.nom_fichier,
          q.genere_le
        ]
      })
    )
  )

  ecrire(
    'paiements.csv',
    versCsv(
      ['bail_id', 'periode', 'montant_paye', 'date_paiement', 'statut', 'mode_paiement', 'reference'],
      paiementRepository.listAll().map((p) => [
        p.bail_id, p.periode, p.montant_paye, p.date_paiement, p.statut, p.mode_paiement, p.reference
      ])
    )
  )

  return join(dossier, fichiers.join(', '))
}

// ----------------------------------------------------------------------------
// Sauvegarde / restauration de la base SQLite.
// ----------------------------------------------------------------------------
export async function creerSauvegarde(): Promise<string | null> {
  const win = BrowserWindow.getAllWindows()[0]
  const date = new Date().toISOString().slice(0, 10)
  const res = await dialog.showSaveDialog(win, {
    title: 'Enregistrer une sauvegarde de la base de données',
    defaultPath: `gestyloc_sauvegarde_${date}.db`,
    filters: [{ name: 'Base SQLite', extensions: ['db'] }]
  })
  if (res.canceled || !res.filePath) return null

  // Checkpoint WAL : tout flusher dans le fichier .db avant la copie.
  getRawConnection().pragma('wal_checkpoint(TRUNCATE)')
  copyFileSync(getDbPath(), res.filePath)
  log.info(`Sauvegarde créée : ${res.filePath}`)
  return res.filePath
}

/**
 * Restaure une sauvegarde : remplace la base actuelle par le fichier choisi
 * puis relance l'application (la connexion doit être recréée proprement).
 */
export async function restaurerSauvegarde(): Promise<boolean> {
  const win = BrowserWindow.getAllWindows()[0]
  const res = await dialog.showOpenDialog(win, {
    title: 'Sélectionner une sauvegarde à restaurer (l’application va redémarrer)',
    properties: ['openFile'],
    filters: [{ name: 'Base SQLite', extensions: ['db'] }]
  })
  if (res.canceled || res.filePaths.length === 0) return false
  const source = res.filePaths[0]

  if (!existsSync(source)) throw new Error('Fichier de sauvegarde introuvable.')

  // Copie de sécurité de la base actuelle avant écrasement.
  const dossierBackup = join(app.getPath('userData'), 'backups')
  if (!existsSync(dossierBackup)) mkdirSync(dossierBackup, { recursive: true })
  const avantEcrasement = join(dossierBackup, `avant_restauration_${Date.now()}.db`)
  copyFileSync(getDbPath(), avantEcrasement)

  // Ferme la connexion, écrase, relance.
  closeDb()
  copyFileSync(source, getDbPath())
  // Supprime les résidus WAL/SHM de l'ancienne base (incohérents avec le nouveau .db).
  for (const ext of ['-wal', '-shm']) {
    const p = getDbPath() + ext
    if (existsSync(p)) require('fs').unlinkSync(p)
  }

  log.info(`Base restaurée depuis ${source} (ancienne base : ${avantEcrasement})`)
  app.relaunch()
  app.exit(0)
  return true
}
