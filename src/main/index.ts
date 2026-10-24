import { app, shell, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initAutoUpdater, checkForUpdates, downloadUpdate, quitAndInstall } from './updater'
import { getDb, getDbPath, closeDb } from './database/connection'
import { runMigrations } from './database/migrate'
import { registerDatabaseHandlers } from './database/ipc'
import icon from '../../resources/icon.png?asset'

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
