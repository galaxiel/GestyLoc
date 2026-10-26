// ============================================================================
// Runner de migrations versionnées.
//
// Stratégie : une table `_migrations` trace les migrations déjà appliquées.
// Au démarrage, on exécute dans l'ordre celles qui manquent, chacune dans une
// transaction. Ainsi :
//   - l'ajout d'une nouvelle table/colonne ne casse jamais l'existant
//   - la BDD d'un utilisateur existant est mise à jour automatiquement
//   - une nouvelle install part de zéro
//
// Les fichiers SQL sont importés via "?raw" (Vite les inline dans le bundle),
// ce qui fonctionne aussi bien en dev qu'en app packagée.
// ============================================================================

import { getRawConnection } from './connection'
import log from 'electron-log'

// Imports "?raw" : le contenu SQL est embarqué dans le bundle comme une string.
import initSql from './migrations/0001_init.sql?raw'
import parametresSql from './migrations/0002_parametres.sql?raw'
import occupationGratuiteSql from './migrations/0003_occupation_gratuite.sql?raw'
import patrimoineSql from './migrations/0004_patrimoine.sql?raw'
import bauxComplementsSql from './migrations/0005_baux_complements.sql?raw'
import quittancesSql from './migrations/0006_quittances.sql?raw'
import regularisationSql from './migrations/0007_regularisation.sql?raw'
import nomBienSql from './migrations/0008_nom_bien.sql?raw'

interface Migration {
  id: string
  name: string
  sql: string
}

// Liste ordonnée des migrations à appliquer.
// IMPORTANT : ne JAMAIS réordonner ni modifier une migration déjà publiée.
// Pour changer un schéma : ajouter une NOUVELLE entrée à la fin.
const migrations: Migration[] = [
  { id: '0001', name: 'init', sql: initSql },
  { id: '0002', name: 'parametres', sql: parametresSql },
  { id: '0003', name: 'occupation_gratuite', sql: occupationGratuiteSql },
  { id: '0004', name: 'patrimoine', sql: patrimoineSql },
  { id: '0005', name: 'baux_complements', sql: bauxComplementsSql },
  { id: '0006', name: 'quittances', sql: quittancesSql },
  { id: '0007', name: 'regularisation', sql: regularisationSql },
  { id: '0008', name: 'nom_bien', sql: nomBienSql }
  // Futures migrations à ajouter ici :
  // { id: '0004', name: 'add_xxx', sql: xxxSql },
]

/**
 * Applique toutes les migrations non encore jouées.
 * À appeler au démarrage de l'app, AVANT les premiers handlers IPC DB.
 */
export function runMigrations(): void {
  const conn = getRawConnection()

  // 1) Crée la table de suivi si elle n'existe pas.
  conn.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // 2) Liste les migrations déjà appliquées.
  const applied = conn.prepare('SELECT id FROM _migrations').all() as {
    id: string
  }[]
  const appliedIds = new Set(applied.map((r) => r.id))

  // 3) Filtre + trie les migrations manquantes.
  const pending = migrations.filter((m) => !appliedIds.has(m.id))

  if (pending.length === 0) {
    log.info('BDD à jour, aucune migration à appliquer.')
    return
  }

  for (const migration of pending) {
    const tx = conn.transaction(() => {
      conn.exec(migration.sql)
      conn.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(
        migration.id,
        migration.name
      )
    })

    try {
      tx()
      log.info(`Migration ${migration.id}_${migration.name} appliquée.`)
    } catch (err) {
      log.error(`Échec migration ${migration.id}_${migration.name}:`, err)
      throw err
    }
  }
}
