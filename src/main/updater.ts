import { autoUpdater, UpdateCheckResult, UpdateInfo } from 'electron-updater'
import { BrowserWindow, Notification } from 'electron'
import log from 'electron-log'
import { UPDATER_CHANNELS } from '@shared/updater-channels'

export { UPDATER_CHANNELS }

let mainWindow: BrowserWindow | null = null

/**
 * Configure electron-updater et branch les évènements :
 *  - logging via electron-log (fichier dans AppData/logs)
 *  - propagation de chaque évènement vers le renderer (React) via IPC
 *
 * La logique d'UX (demander à l'utilisateur, afficher une notif) est gérée
 * côté renderer grâce aux évènements forwardés : le main reste "muet".
 */
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  // Redirige les logs de l'updater vers electron-log (pratique pour débugger).
  log.transports.file.level = 'info'
  autoUpdater.logger = log
  // On télécharge MANUELLEMENT (pas en auto) pour pouvoir demander l'avis de
  // l'utilisateur avant, conformément au cahier des charges.
  autoUpdater.autoDownload = false
  // L'installation se fait au redémarrage (on propose aussi "installer now").
  autoUpdater.autoInstallOnAppQuit = true

  branchEvents()
}

/** Lance la vérification des mises à jour (appelée au démarrage de l'app). */
export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  try {
    return await autoUpdater.checkForUpdates()
  } catch (err) {
    log.error('checkForUpdates a échoué:', err)
    return null
  }
}

/** Déclenche le téléchargement de la mise à jour (après accord utilisateur). */
export function downloadUpdate(): void {
  void autoUpdater.downloadUpdate()
}

/** Quitte l'app et installe la mise à jour téléchargée. */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}

/** Renvoie la dernière UpdateInfo connue (pour afficher le n° de version). */
export function getUpdateInfo(): UpdateInfo | null {
  return autoUpdater.currentVersion ? getCachedUpdateInfo() : null
}

// electron-updater ne expose pas directement l'UpdateInfo courante ; on la
// conserve en cache à chaque détection.
let cachedInfo: UpdateInfo | null = null
function getCachedUpdateInfo(): UpdateInfo | null {
  return cachedInfo
}

/** Branche tous les évènements de l'auto-updater et les forward au renderer. */
function branchEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    send(UPDATER_CHANNELS.checking)
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    cachedInfo = info
    log.info(`Mise à jour disponible : v${info.version}`)
    send(UPDATER_CHANNELS.available, {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    })
    // Notif native (visible même si l'app est minimisée).
    showNotification(
      'Mise à jour disponible',
      `La version ${info.version} est disponible. Cliquez pour la télécharger.`
    )
  })

  autoUpdater.on('update-not-available', () => {
    send(UPDATER_CHANNELS.notAvailable)
  })

  autoUpdater.on('download-progress', (progress) => {
    send(UPDATER_CHANNELS.progress, {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    })
  })

  autoUpdater.on('update-downloaded', () => {
    log.info('Mise à jour téléchargée, installation au prochain redémarrage.')
    send(UPDATER_CHANNELS.downloaded)
    showNotification(
      'Mise à jour prête',
      "Elle sera installée au redémarrage. Cliquez pour redémarrer maintenant."
    )
  })

  autoUpdater.on('error', (err: Error) => {
    log.error('Updater error:', err)
    send(UPDATER_CHANNELS.error, { message: err.message })
  })
}

/** Envoie un évènement IPC au renderer si la fenêtre existe encore. */
function send(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

/** Affiche une notification native de l'OS. */
function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}
