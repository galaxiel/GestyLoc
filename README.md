# GestyLoc

Logiciel de bureau (Windows) de gestion locative : biens, locataires, baux,
quittances PDF, suivi des paiements et alertes automatiques.
**100 % local** : les données sont stockées dans SQLite (dossier AppData), aucun
serveur ni internet requis.

## Stack

- **Electron 40** + **electron-vite** (main / preload / renderer)
- **React 19 + TypeScript**, **Tailwind CSS** (thème clair/sombre automatique)
- **SQLite** via `better-sqlite3` v12 (Node-API) + **Drizzle ORM** (schéma typé)
- **pdfmake** (quittances PDF), **electron-updater** (mises à jour via GitHub Releases)

## Démarrage

```bash
npm install          # installe les dépendances (rebuild natif auto via postinstall)
npm run dev          # lance l'app en dev (HMR)
npm run build        # typecheck + build production
npm run build:win    # génère l'installeur NSIS dans dist/
```

> Si `npm install` échoue sur `better-sqlite3` : `npx electron-rebuild -f -w better-sqlite3`

## Structure

```
src/main/        Processus principal : fenêtre, updater, BDD, IPC, services
  database/      Connexion SQLite (AppData), migrations versionnées, schéma Drizzle
  repositories/  Accès aux données (1 fichier par entité)
  services/      Alertes, documents, quittances
  database/ipc.ts  Registre central des handlers IPC
src/preload/     Pont sécurisé contextBridge -> window.api (typé)
src/renderer/    Application React (pages, composants, hooks)
shared/          Types partagés main <-> renderer (contrats IPC)
```

Ajouter une fonctionnalité = ajouter une table (migration), un repository, un
handler IPC, une méthode preload, une page React. Rien de l'existant ne bouge.

## Base de données

Emplacement : `%APPDATA%/gestion-locative/data/app.db` (mode WAL).
Migrations versionnées dans `src/main/database/migrations/`, appliquées au
démarrage. Pour modifier le schéma :

1. Éditer `src/main/database/schema.ts`
2. Générer le SQL : `npm run db:generate`
3. Importer le nouveau `.sql` dans `migrate.ts` (entrée `{ id: '000N', ... }`)

## Publication d'une mise à jour

Les releases sont publiées sur GitHub (`galaxiel/GestyLoc`, en draft) :

```bash
git tag v1.0.1
git push origin v1.0.1   # -> GitHub Actions build et crée la draft release
```

Puis sur GitHub : relire la draft (notes de version) et cliquer **Publish**.
Les installs existantes détectent la nouvelle version au lancement (notif
native), proposent le téléchargement, et installent au redémarrage.

Variables utiles : voir `.env.example` (`GH_TOKEN` pour publier en local avec
`npx electron-builder --win --publish always`).
