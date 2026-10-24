# AGENTS.md — Note de passation pour agent LLM

> **À tout agent (LLM) qui reprend ce projet** : ce fichier te donne tout le
> contexte nécessaire pour continuer le développement sans aide humaine
> technique. Lis-le entièrement avant de modifier quoi que ce soit. Le suivi
> des tâches à faire est dans `ROADMAP.md`.

---

## 1. Le projet en une phrase

**GestyLoc** est un logiciel de bureau Windows de gestion locative (biens,
locataires, baux, quittances PDF, suivi des paiements, alertes) fonctionnant
**100 % hors ligne** : les données vivent dans SQLite dans le dossier AppData
de l'utilisateur. Distribué publiquement via GitHub Releases avec
auto-mise-à-jour.

État actuel : **v1.0.0 publiée** et fonctionnelle (voir
https://github.com/galaxiel/GestyLoc/releases). Le MVP est complet — ne
considère aucune fonctionnalité listée dans la V1.0 de `ROADMAP.md` comme
restante.

## 2. Stack et versions (IMPORTANT — compatibilités fragiles)

| Élément | Version | Pourquoi c'est critique |
|---|---|---|
| Electron | **40.9.3** (`^40.9.3` dans package.json) | Choisi car le binaire était disponible ; `better-sqlite3@11` **ne compile PAS** contre Electron 39+ (API V8 `GetIsolate` supprimée). Ne pas descendre. |
| better-sqlite3 | **12.11.1 minimum** | La v12 utilise **Node-API** (stable entre versions). Ne jamais repasser en v11. |
| Node.js local | 26.3.1 | Aucun binaire précompilé better-sqlite3 pour Node 26 → la compilation échoue si le module est compilé pour Node. Il DOIT être compilé pour **Electron**. |
| React / TS | 19.x / 5.9 | Standard. |
| Tailwind | **v3.4** (pas v4) | Choix délibéré pour stabilité. Ne pas migrer en v4 sans raison. |

**Si `npm install` échoue sur better-sqlite3** (erreur node-gyp/MSBuild) :

```bash
npm install --ignore-scripts        # tout sauf les modules natifs
npx electron-rebuild -f -w better-sqlite3   # compile contre Electron, pas Node
```

Le `postinstall` (`electron-builder install-app-deps`) fait normalement ça
automatiquement — ne le supprime pas.

## 3. Architecture (modulaire, à préserver)

```
src/main/          Processus principal Node.js (jamais de React ici)
  index.ts         Cycle de vie app + fenêtre + enregistrement IPC
  updater.ts       electron-updater (événements forwardés au renderer)
  database/
    connection.ts  Singleton better-sqlite3 + Drizzle (AppData, WAL)
    schema.ts      Schéma Drizzle = SOURCE DE VÉRITÉ du modèle de données
    migrate.ts     Runner de migrations (imports ?raw des .sql, ordre strict)
    migrations/    Fichiers SQL numérotés 0001_init.sql, ...
    ipc.ts         Registre central de TOUS les handlers IPC
  repositories/    1 fichier par entité (bien, locataire, bail, paiement)
  services/        Logique métier (alertes, documents, quittances)

src/preload/       Pont contextBridge : définit window.api (l'unique surface
                   d'appel renderer → main). Typé via index.d.ts.

src/renderer/      Application React (HashRouter)
  pages/           1 page = 1 module (Dashboard, BiensLocataires, Paiements,
                   Quittances, Parametres)
  hooks/useStore.tsx  Store central : locations + alertes + refresh()
  lib/ipc.ts       Client typé : déballe {ok, data|error} en exceptions
  lib/format.ts    Formatage fr-FR (euros, dates, périodes)

shared/            Contrats partagés main ↔ renderer (types.ts,
                   updater-channels.ts). Aucune dépendance importable ici.
```

### Conventions non négociables

1. **Le renderer n'accède JAMAIS à Node/fs directement.** Tout passe par
   `window.api` (preload) → IPC (main). Pas d'exception.
2. **Enveloppe IPC** : chaque handler renvoie `{ ok: true, data }` ou
   `{ ok: false, error }` via le wrapper `handle()` de `database/ipc.ts`.
   Le client `lib/ipc.ts` du renderer la déballe en exception.
3. **Nommage des canaux** : `db:<entité>:<action>` (ex: `db:baux:create`),
   `docs:<action>`, `quittance:<action>`, `updater:<action>`.
4. **Toute modification du schéma passe par une NOUVELLE migration** (voir §5).
   Ne jamais modifier un `.sql` déjà appliqué chez les utilisateurs.
5. **Les types partagés** (`shared/types.ts`) sont le contrat unique. Si tu
   changes un payload, change-le là et propage.

## 4. Ajouter une fonctionnalité (le chemin complet)

Exemple : ajouter une entité « Contrat d'assurance ». Dans l'ordre :

1. `shared/types.ts` : ajouter les interfaces (`Assurance`, `CreateAssuranceInput`…)
2. `src/main/database/schema.ts` : ajouter la table Drizzle
3. Générer la migration : `npm run db:generate` → produit un `.sql` dans
   `src/main/database/migrations/`
4. `src/main/database/migrate.ts` : ajouter `import xxxSql from './migrations/000N_xxx.sql?raw'`
   + entrée `{ id: '000N', name: 'xxx', sql: xxxSql }` **à la fin de la liste**
5. `src/main/repositories/assurance.repository.ts` : requêtes Drizzle typées
6. `src/main/database/ipc.ts` : handler `handle('db:assurances:list', () => …)`
7. `src/preload/index.ts` : méthode typée dans `api.db` (+ type retourné)
8. `src/renderer/src/lib/ipc.ts` : exposer au renderer (déballe l'enveloppe)
9. Page React dans `src/renderer/src/pages/` + route dans `App.tsx` + lien dans `Sidebar.tsx`
10. `npm run typecheck && npm run build` doit passer avant tout commit.

## 5. Procédure de migration BDD (détaillée)

Les migrations sont appliquées **au démarrage de l'app** (pas par drizzle-kit),
traçées dans la table `_migrations`. Règles :

- Ne JAMAIS éditer/réordonner/supprimer une migration déjà publiée (elle est
  déjà jouée chez les utilisateurs).
- Pour changer le schéma : éditer `schema.ts`, `npm run db:generate`, puis
  ajouter le nouveau `.sql` comme nouvelle entrée dans `migrate.ts`.
- Le SQL est **inline dans le bundle** via `import xxx from './x.sql?raw'` —
  pas de `readFileSync` (qui casserait en production). Les déclarations de
  types `*.sql?raw` sont dans `src/main/env.d.ts`.
- La BDD utilisateur est dans `%APPDATA%/gestyloc/data/app.db`. Le dossier est
  créé automatiquement ; les migrations jouent dans une transaction chacune.

## 6. Commandes

```bash
npm run dev          # dev (HMR, DevTools ouverts)
npm run typecheck    # tsc node + web — OBLIGATOIRE avant commit
npm run build        # typecheck + build electron-vite
npm run build:win    # typecheck + build + installeur NSIS dans dist/
npm run build:unpack # build + dossier non packagé (test rapide sans installeur)
npm run db:generate  # génère une migration depuis schema.ts (drizzle-kit)
```

Il n'y a **pas encore de suite de tests automatisée**. Les validations ont été
faites par smoke-tests Electron (scripts lancés avec
`./node_modules/.bin/electron script.js` — le module natif ne charge PAS dans
`node` pur, seulement dans Electron : c'est normal, voir §2). Ajouter des
tests (vitest sur repositories/services) est une dette listée dans ROADMAP.

## 7. Auto-mise-à-jour et releases

- `electron-builder.yml` → `publish: github, owner: galaxiel, repo: GestyLoc,
  releaseType: draft`.
- L'updater vérifie au lancement **en production seulement** (désactivé en dev
  via `is.dev`). Flux : check → notif native + event IPC → téléchargement sur
  accord utilisateur → install au redémarrage. `autoDownload: false` est
  volontaire (cahier des charges).
- Le renderer s'abonne aux événements via `window.api.updater.on(...)` ; les
  noms de canaux sont dans `shared/updater-channels.ts`.
- **Release** : bump `package.json` → commit → `git tag vX.Y.Z` → push →
  GitHub Actions construit et crée une draft → publier la draft sur GitHub.
  Détail complet pour humains dans `CONTRIBUTING.md`.

### Bug connu d'electron-builder (v26.15.3)

Lors de la publication via Actions, il arrive qu'il crée **deux draft
releases** (course à l'upload) : une avec l'exe + `latest.yml`, une avec
seulement le `.blockmap`. Correction : déplacer le blockmap dans la release
complète (download + re-upload via API GitHub avec le bon nom de fichier) et
supprimer la draft orpheline. Une release valide = **exactement 3 assets** :
`gestyloc-X.Y.Z-setup.exe`, `gestyloc-X.Y.Z-setup.exe.blockmap`, `latest.yml`.

### Autre piège

`resources/app-update.yml` (fichier lu par l'updater en production) n'est
généré que pour les cibles d'installation (NSIS), **pas** pour `--dir`. Un
échec updater « ENOENT app-update.yml » sur un build `--dir` est donc normal.

## 8. Fonctionnalités livrées (v1.0.0) — ne pas refaire

- CRUD complet biens/locataires/baux (formulaire unifié « ligne tableur »)
- Dashboard : stats (loyers CC mensuels, surface) + alertes (fins de bail
  < 90 j calculées dans `alertes.service.ts`, révisions IRL > 1 an, impayés)
- Quittances PDF : pdfmake **côté renderer** (polices via `vfs_fonts`,
  branchement tolerant aux formes de module — voir `pages/Quittances.tsx`),
  sauvegarde via dialog natif côté main (`quittance.service.ts`)
- Paiements : upsert par (bail_id, période) — clé composite en BDD
- Documents : service main complet (copie vers AppData, chemin en BDD),
  IPC `docs:*` — **l'interface React n'existe pas encore** (voir ROADMAP V1.1)
- Thème clair/sombre : Tailwind `darkMode: 'media'` (suit l'OS) ;
  `nativeTheme.themeSource = 'system'`

## 9. Prochaines étapes

Lire `ROADMAP.md` : la priorité V1.1 est **l'import du tableur Excel
existant** de l'utilisateur (mapping colonnes → tables normalisées), le
**profil bailleur** (nom/adresse pré-remplis dans les quittances — champs
actuellement `____`) et la **page Documents** (backend déjà prêt).

## 10. Environnement humain

- Utilisateur : **galaxiel** (GitHub), Windows 11, parlant français —
  communique en français.
- Pas de contrainte de serveur : tout est local et gratuit (GitHub Actions).
- Le token `GH_TOKEN` n'est nécessaire que pour publier une release depuis
  une machine locale ; GitHub Actions utilise `secrets.GITHUB_TOKEN` auto.
