import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      // Bundle généré par le harnais BDD (`npm run test:db`), jamais édité à la main
      'scripts/test-db/bundle.mjs'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // Chargement de données : le pattern voulu de l'app est « useEffect ->
      // setState » (useStore, pages) — la règle v7 le flag par principe,
      // mais les setState ont lieu après await (asynchrone) ou au montage
      // initial, sans cascade réelle. Réactiver si refonte du store.
      'react-hooks/set-state-in-effect': 'off',
      // Props déjà validés par TypeScript — la validation runtime est redondante.
      'react/prop-types': 'off'
    }
  },
  eslintConfigPrettier
)
