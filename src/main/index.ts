import { app, shell, BrowserWindow, ipcMain, nativeTheme, Notification } from 'electron'
import { join, dirname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initAutoUpdater, checkForUpdates, downloadUpdate, quitAndInstall } from './updater'
import { getDb, getDbPath, closeDb } from './database/connection'
import { runMigrations } from './database/migrate'
import { registerDatabaseHandlers } from './database/ipc'
import { executerSauvegardeAuto } from './services/donnees.service'
import { bailRepository } from './repositories/bail.repository'
import { computeAlertes } from './services/alertes.service'
import { resumerAlertesUrgentes } from '@shared/notifications'
import icon from '../../resources/icon.png?asset'

// ============================================================================
// MODE PORTABLE : quand l'app est lancée depuis le .exe portable, Electron
// définit PORTABLE_EXECUTABLE_DIR. Dans ce cas, toutes les données (BDD,
// documents, sauvegardes) vivent dans un dossier "donnees" À CÔTÉ du .exe —
// la version est alors vraiment transportable (clé USB), sans toucher AppData.
// En version installée, on garde le comportement standard (AppData).
// ============================================================================
// Version portable (zip) : le dossier extrait contient un marqueur PORTABLE
// (ou un dossier donnees déjà présent). Les données vivent alors à côté de
// l'exe, dans le dossier extrait — transportables avec lui.
import { existsSync } from 'fs'
if (app.isPackaged) {
  const exeDir = dirname(app.getPath('exe'))
  if (
    process.env.PORTABLE_EXECUTABLE_DIR ||
    existsSync(join(exeDir, 'PORTABLE')) ||
    existsSync(join(exeDir, 'donnees'))
  ) {
    app.setPath('userData', join(exeDir, 'donnees'))
  }
}

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'GestyLoc',
    // icon appliquée sur toutes les plateformes (le build l'incorpore).
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Les liens externes (http/https) s'ouvrent dans le navigateur par défaut.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    // DevTools ouverts en développement uniquement.
    mainWindow.webContents.openDevTools()
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/**
 * Au démarrage, affiche une notification Windows si des alertes urgentes
 * existent (impayés, bail expiré…). Silencieuse sinon ; toute erreur est
 * ignorée (une notification ne doit jamais empêcher l'app de démarrer).
 */
function notifierAlertesUrgentes(win: BrowserWindow): void {
  try {
    const resume = resumerAlertesUrgentes(computeAlertes(bailRepository.listWithRelations()))
    if (!resume || !Notification.isSupported()) return
    const notif = new Notification({ title: resume.titre, body: resume.corps })
    notif.on('click', () => {
      win.show()
      win.focus()
    })
    notif.show()
    console.log(`Notification d'alertes : ${resume.titre}`)
  } catch (err) {
    console.warn('Notification d’alertes échouée :', err)
  }
}

app.whenReady().then(() => {
  // Identifiant unique Windows (taskbar grouping, notifications).
  electronApp.setAppUserModelId('com.galaxiel.gestyloc')

  // Raccourcis dev (F12 = devtools) ignorés en production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ---- Registre IPC : updater ----
  // Le renderer demande / contrôle les mises à jour via ces canaux.
  ipcMain.handle('updater:check', async () => checkForUpdates())
  ipcMain.handle('updater:download', () => downloadUpdate())
  ipcMain.handle('updater:install', () => quitAndInstall())

  // ---- Registre IPC : infos app ----
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-db-path', () => getDbPath())
  ipcMain.handle('app:open-data-folder', async () => {
    const { shell } = await import('electron')
    return (await shell.showItemInFolder(getDbPath())) === undefined
  })

  // ---- Base de données ----
  // Ouverture SQLite (AppData) + migrations versionnées, AVANT tout handler IPC.
  getDb()
  runMigrations()
  console.log(`Base de données prête : ${getDbPath()}`)

  // ---- Registre IPC : base de données ----
  registerDatabaseHandlers()

  // ---- Préférence thème ----
  // Suit le thème de l'OS par défaut (modifiable depuis les paramètres ensuite).
  nativeTheme.themeSource = 'system'

  const win = createWindow()

  // ---- Notification Windows des alertes urgentes ----
  // Au démarrage, si des alertes urgentes existent (impayés, bail expiré…),
  // une notification native les résume ; un clic ramène sur GestyLoc.
  notifierAlertesUrgentes(win)

  // ---- Auto-updater ----
  // Initialisé après la fenêtre pour pouvoir forwarder les évènements au renderer.
  initAutoUpdater(win)
  // Vérification au lancement (silencieuse en cas d'erreur).
  if (!is.dev) {
    // En dev, l'updater ne sert à rien (pas de signature sur l'app non packagée).
    void checkForUpdates().catch(() => {
      /* silencieux */
    })
  }

  // ---- Sauvegarde automatique hebdomadaire ----
  // Décalée pour ne pas concurrencer l'ouverture ; unref() pour ne jamais
  // retenir l'app si elle se referme avant ; toute erreur est ignorée (une
  // sauvegarde ratée ne doit jamais empêcher l'application de fonctionner).
  const sauvegardeAuto = setTimeout(() => {
    try {
      executerSauvegardeAuto()
    } catch (err) {
      console.warn('Sauvegarde automatique hebdomadaire échouée :', err)
    }
  }, 15_000)
  sauvegardeAuto.unref()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Fermeture propre de SQLite à l'arrêt (flush WAL -> fichier .db).
app.on('will-quit', () => {
  closeDb()
})
