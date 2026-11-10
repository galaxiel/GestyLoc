import { dialog, BrowserWindow, app } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
  rmSync
} from 'fs'
import { join, basename } from 'path'
import { getDbPath, getRawConnection, closeDb } from '../database/connection'
import { versCsv } from '@shared/csv'
import {
  nomSauvegardeAuto,
  rotationSauvegardes,
  sauvegardeDue,
  type SauvegardeAutoState
} from '@shared/sauvegarde'
import { bailRepository } from '../repositories/bail.repository'
import { bienRepository } from '../repositories/bien.repository'
import { locataireRepository } from '../repositories/locataire.repository'
import { paiementRepository } from '../repositories/paiement.repository'
import { listQuittances } from './quittance.service'
import log from 'electron-log'
import { parametresRepository } from '../repositories/parametres.repository'

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
    writeFileSync(final, contenu, 'utf-8')
    fichiers.push(basename(final))
  }

  ecrire(
    'biens.csv',
    versCsv(
      ['id', 'type_bien', 'designation', 'adresse', 'code_postal', 'ville', 'surface_m2', 'meuble'],
      bienRepository
        .list()
        .map((b) => [
          b.id,
          b.type_bien,
          b.designation,
          b.adresse,
          b.code_postal,
          b.ville,
          b.surface_m2,
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
      [
        'id',
        'bien',
        'locataire',
        'debut',
        'fin',
        'trimestre_ref',
        'loyer_hc',
        'charges',
        'loyer_cc',
        'loyer_m2_hc',
        'annuel_hc',
        'annuel_cc',
        'irl_ref',
        'irl_nouveau',
        'taux_irl',
        'nouveau_loyer_hc',
        'frais_agence',
        'actif',
        'occupation_gratuite',
        'derniere_revision'
      ],
      bailRepository
        .listWithRelations()
        .map((r) => [
          r.bail.id,
          r.bien.designation,
          r.locataire.nom_complet,
          r.bail.date_debut_bail,
          r.bail.date_fin_bail,
          r.bail.trimestre_reference,
          r.bail.loyer_hc,
          r.bail.charges,
          r.bail.loyer_cc,
          r.bail.loyer_metre_carre_hc,
          r.bail.loyer_annuel_hc,
          r.bail.loyer_annuel_cc,
          r.bail.irl_reference,
          r.bail.irl_nouveau,
          r.bail.taux_irl,
          r.bail.nouveau_loyer_hc,
          r.bail.frais_agence,
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
      [
        'bail_id',
        'periode',
        'montant_paye',
        'date_paiement',
        'statut',
        'mode_paiement',
        'reference'
      ],
      paiementRepository
        .listAll()
        .map((p) => [
          p.bail_id,
          p.periode,
          p.montant_paye,
          p.date_paiement,
          p.statut,
          p.mode_paiement,
          p.reference
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
    if (existsSync(p)) unlinkSync(p)
  }

  log.info(`Base restaurée depuis ${source} (ancienne base : ${avantEcrasement})`)
  app.relaunch()
  app.exit(0)
  return true
}

// ----------------------------------------------------------------------------
// Remise à zéro : efface TOUTES les données (baux, locataires, paiements,
// quittances tracées, régularisations, dépenses, documents joints) et relance
// l'app, qui repart sur une base neuve (les migrations rejouent au démarrage).
// Filet de sécurité : une sauvegarde COMPLÈTE est créée automatiquement juste
// avant l'effacement (dans userData/backups/) — restaurable via le bouton
// « Restaurer une sauvegarde » de Paramètres. La base réelle du propriétaire
// n'est touchée QUE par cette action explicite déclenchée depuis l'UI.
// ----------------------------------------------------------------------------
export function remettreAZero(): string {
  // 1) Sauvegarde automatique complète (WAL checkpointé avant la copie).
  const dossierBackup = join(app.getPath('userData'), 'backups')
  if (!existsSync(dossierBackup)) mkdirSync(dossierBackup, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const sauvegarde = join(dossierBackup, `avant_remise_a_zero_${stamp}.db`)
  getRawConnection().pragma('wal_checkpoint(TRUNCATE)')
  copyFileSync(getDbPath(), sauvegarde)
  log.warn(`REMISE À ZÉRO — sauvegarde complète créée avant effacement : ${sauvegarde}`)

  // 2) Ferme la connexion, efface la base et ses résidus WAL/SHM.
  closeDb()
  unlinkSync(getDbPath())
  for (const ext of ['-wal', '-shm']) {
    const p = getDbPath() + ext
    if (existsSync(p)) unlinkSync(p)
  }

  // 3) Efface les documents joints (sinon fichiers orphelins sans bail).
  const dossierDocuments = join(app.getPath('userData'), 'documents')
  if (existsSync(dossierDocuments)) rmSync(dossierDocuments, { recursive: true, force: true })

  // 4) Relance : l'app repart sur une base neuve, migrations rejouées.
  log.warn('Base et documents supprimés — relance de l’application.')
  app.relaunch()
  app.exit(0)
  return sauvegarde
}

// ----------------------------------------------------------------------------
// Sauvegarde automatique hebdomadaire : au démarrage, au plus une fois par
// semaine, une copie de la base est créée dans userData/backups/ et la
// rotation conserve les 5 dernières (règles pures dans shared/sauvegarde.ts).
// Fire-and-forget : jamais bloquante ni fatale, erreurs journalisées.
// ----------------------------------------------------------------------------
export function dossierSauvegardesAuto(): string {
  return join(app.getPath('userData'), 'backups')
}

export function executerSauvegardeAuto(maintenant: Date = new Date()): string | null {
  const param = parametresRepository.get<SauvegardeAutoState>('sauvegarde_auto')
  if (!sauvegardeDue(param?.derniere ?? null, maintenant)) return null

  const dossier = dossierSauvegardesAuto()
  if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true })

  // Checkpoint WAL : tout flusher dans le .db avant la copie (comme pour les
  // sauvegardes manuelles).
  getRawConnection().pragma('wal_checkpoint(TRUNCATE)')
  const fichier = join(dossier, nomSauvegardeAuto(maintenant))
  copyFileSync(getDbPath(), fichier)

  // Rotation : les fichiers hors format (avant_restauration_*, …) ne sont
  // jamais touchés.
  const { aSupprimer } = rotationSauvegardes(readdirSync(dossier))
  for (const nom of aSupprimer) {
    try {
      unlinkSync(join(dossier, nom))
    } catch {
      log.warn(`Sauvegarde auto : impossible de supprimer ${nom}`)
    }
  }

  parametresRepository.set('sauvegarde_auto', { derniere: maintenant.toISOString() })
  log.info(
    `Sauvegarde automatique créée : ${fichier} (rotation : ${aSupprimer.length} ancienne(s) supprimée(s))`
  )
  return fichier
}
