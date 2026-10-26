# CONTRIBUTING — Guide développeur

> Document destiné aux développeurs (humains ou agents LLM) qui veulent
> modifier ou publier GestyLoc. Pour une présentation du logiciel, voir le
> `README.md`. Contexte technique complet : `AGENTS.md`. Feuille de route :
> `ROADMAP.md`.

## Installer l'environnement

Prérequis : **Node.js** (v20+) et **Git**. Windows uniquement pour le build.

```bash
git clone https://github.com/galaxiel/GestyLoc.git
cd GestyLoc
npm install       # installe tout (le rebuild natif est automatique)
npm run dev       # lance l'app en développement (HMR + DevTools)
```

Si `npm install` échoue sur `better-sqlite3` (erreur node-gyp/MSBuild) :

```bash
npm install --ignore-scripts
npx electron-rebuild -f -w better-sqlite3
```

Détail de ce problème de compilation : voir `AGENTS.md` §2.

## Commandes

```bash
npm run dev          # développement
npm test             # tests vitest
npm run typecheck    # TypeScript strict (obligatoire avant commit)
npm run build        # typecheck + build production
npm run build:win    # installeur NSIS dans dist/
```

## Architecture

```
src/main/          Processus principal Node.js (BDD, IPC, services, updater)
src/preload/       Pont sécurisé contextBridge -> window.api (typé)
src/renderer/      Application React (pages, hooks, lib)
shared/            Types et utilitaires partagés main <-> renderer
```

Conventions importantes (nommage IPC, enveloppe d'erreurs, migrations) :
voir `AGENTS.md` §3. Procédure complète pour ajouter une fonctionnalité
de bout en bout : `AGENTS.md` §4.

## Publier une nouvelle version

Le fichier `.github/workflows/release.yml` dit à GitHub : **quand un tag qui
commence par `v` est poussé sur le dépôt, construire l'installeur Windows et
créer une release avec**. Un **tag** est une étiquette posée sur un commit
(une photo du code à un instant T), par exemple `v1.4.0`.

Autrement dit : **tu n'as jamais besoin de construire l'installeur sur ta
machine pour distribuer une version**. GitHub le fait à ta place.

### Le rituel, étape par étape

**1. Augmente le numéro de version** dans `package.json` :

```json
"version": "1.4.0",
```

**2. Enregistre et pousse ton code** :

```bash
git add -A
git commit -m "Description de ce qui a changé"
git push
```

**3. Pose le tag et pousse-le** (le nom du tag doit correspondre à la version,
précédé d'un `v`) :

```bash
git tag v1.4.0
git push origin v1.4.0
```

**4. Attends ~5 minutes.** Sur l'onglet
[Actions](https://github.com/galaxiel/GestyLoc/actions), le build se déroule.
Quand il devient vert, une **draft release** (brouillon) apparaît dans
l'onglet [Releases](https://github.com/galaxiel/GestyLoc/releases) avec
l'installeur `gestyloc-1.4.0-setup.exe`, le `.blockmap` et le `latest.yml`.

**5. ⚠️ Vérifie les assets.**

Rôle des fichiers générés (conventions **non renommables** : `electron-updater`
lit ces chemins exacts, les renommer casserait les mises à jour de toutes les
installations existantes) :

| Asset | Rôle |
|---|---|
| `gestyloc-x.y.z-setup.exe` | L'installateur NSIS (téléchargé par les utilisateurs) |
| `gestyloc-x.y.z-setup.exe.blockmap` | Carte des blocs → mises à jour différentielles (ne retélécharger que ce qui a changé) |
| `latest.yml` | Manifeste lu au démarrage par chaque install : version courante, fichier à télécharger, empreinte SHA512 |
| `GestyLoc-portable.zip` | Version portable : l'app complète (win-unpacked + marqueur PORTABLE) dans un dossier — données stockées à côté de l'exe |

 Depuis la v1.11.3, le workflow publie lui-même les fichiers (le publish
d'electron-builder, buggé — il créait deux drafts et perdait le blockmap —
a été remplacé par un upload déterministe) et **échoue explicitement si un
fichier manque**. Une release valide = **exactement 4 assets** : la liste du
tableau ci-dessus.

**6. Publie le brouillon** : clique sur la release, complète les notes de
version, puis **Publish release**. La version devient téléchargeable
publiquement.

**7. C'est tout.** Les installations existantes détectent la nouvelle version
au lancement (notification native), proposent le téléchargement, et installent
au redémarrage.

### En résumé

```bash
# version dans package.json + commit + push, puis :
git tag v1.4.0 && git push origin v1.4.0
# ~5 min plus tard : Publish sur GitHub -> l'auto-update fait le reste
```

### Publier depuis sa propre machine (alternative)

Nécessite un token GitHub avec droit `repo` (voir `.env.example`) :

```bash
GH_TOKEN=ton_token npx electron-builder --win --publish always
```

## Base de données

Emplacement utilisateur : `%APPDATA%/gestyloc/data/app.db` (mode WAL).
Migrations versionnées dans `src/main/database/migrations/`, appliquées au
démarrage de l'app. Pour modifier le schéma :

1. Éditer `src/main/database/schema.ts`
2. Générer le SQL : `npm run db:generate`
3. Importer le nouveau `.sql` dans `migrate.ts` (nouvelle entrée `{ id: '000N', ... }`)

Règle d'or : ne jamais modifier ni réordonner une migration déjà publiée.
Détails et pièges : `AGENTS.md` §5.
