// Config Drizzle Kit — sert à GÉNÉRER les migrations SQL depuis le schéma TS.
// Usage :
//   npm run db:generate  -> compare schema.ts à l'état actuel, produit un .sql
//   npm run db:migrate   -> applique les migrations (en dev, sur la BDD locale)
//   npm run db:studio    -> ouvre l'interface web pour explorer la BDD
//
// NOTE : en production, les migrations sont appliquées au DÉMARRAGE de l'app
// par src/main/database/migrate.ts (pas besoin de drizzle-kit côté client).
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/main/database/schema.ts',
  // Les .sql générés vont dans le dossier migrations (cohérent avec migrate.ts).
  out: './src/main/database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    // BDD de travail locale (dev uniquement). Jamais la BDD AppData de prod.
    url: './drizzle-dev.db'
  },
  verbose: true,
  strict: true
})
