// ============================================================================
// Connexion SQLite centralisée (singleton).
//
// La base est stockée dans le dossier AppData de l'utilisateur, ce qui :
//   - survit aux mises à jour de l'app (le dossier de l'app est recréé)
//   - fonctionne sans internet (100% local)
//   - est isolé par utilisateur Windows
//
// Chemin Windows : C:\Users\<user>\AppData\Roaming\gestion-locative\data\app.db
// ============================================================================

import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import * as schema from './schema'

export type DB = BetterSQLite3Database<typeof schema>
export type SqliteConnection = Database.Database

let dbInstance: DB | null = null
let rawConnection: SqliteConnection | null = null

/**
 * Retourne le chemin absolu du fichier de base de données.
 * Utilise AppData (Roaming) pour la persistance inter-versions.
 */
export function getDbPath(): string {
  // userData = %APPDATA%/gestion-locative (géré par Electron).
  const dataDir = join(app.getPath('userData'), 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  return join(dataDir, 'app.db')
}

/**
 * Ouvre (ou récupère) la connexion Drizzle à la base SQLite.
 * Active WAL pour de meilleures perfs en lecture/écriture concurrentes.
 */
export function getDb(): DB {
  if (dbInstance) return dbInstance

  const dbPath = getDbPath()
  // mkdir au cas où le dossier n'existerait pas (sécurité supplémentaire).
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Connexion better-sqlite3 brute (synchrone, ultra-rapide).
  rawConnection = new Database(dbPath)
  // WAL = Write-Ahead Logging : meilleures perfs, moins de verrous.
  rawConnection.pragma('journal_mode = WAL')
  // foreign_keys = ON : applique les ON DELETE CASCADE.
  rawConnection.pragma('foreign_keys = ON')
  // busy_timeout : évite "SQLITE_BUSY" si deux écritures se télescopent.
  rawConnection.pragma('busy_timeout = 5000')

  dbInstance = drizzle(rawConnection, { schema })
  return dbInstance
}

/** Retourne la connexion brute better-sqlite3 (pour migrations / requêtes brutes). */
export function getRawConnection(): SqliteConnection {
  if (!rawConnection) {
    // Force l'ouverture via getDb si pas encore fait.
    getDb()
  }
  return rawConnection!
}

/** Ferme proprement la connexion (à l'app.quit). */
export function closeDb(): void {
  if (rawConnection) {
    rawConnection.close()
    rawConnection = null
    dbInstance = null
  }
}
