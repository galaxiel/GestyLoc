import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Configuration vitest — les tests vivent dans tests/ (Node pur : ne JAMAIS
// y importer un module qui charge better-sqlite3, cf. AGENTS.md §2).
// La couverture est lancée séparément : npm run test:coverage
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.ts'],
      // Modules de TYPES SEULS : aucune ligne runtime à couvrir (la logique
      // vit dans les services — audit.service.ts et indices.service.ts, dont
      // le premier est couvert par le harnais test:db et le second est
      // réseau pur, non testable headless — cf. docs/tests/ETAT-HARNAIS.md).
      exclude: ['shared/types.ts', 'shared/audit.ts', 'shared/indices.ts'],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
        statements: 80
      }
    }
  }
})
