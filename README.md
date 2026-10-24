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

Emplacement : `%APPDATA%/gestyloc/data/app.db` (mode WAL).
Migrations versionnées dans `src/main/database/migrations/`, appliquées au
démarrage. Pour modifier le schéma :

1. Éditer `src/main/database/schema.ts`
2. Générer le SQL : `npm run db:generate`
3. Importer le nouveau `.sql` dans `migrate.ts` (entrée `{ id: '000N', ... }`)

## Publier une nouvelle version (explication détaillée)

### Le principe

Le fichier `.github/workflows/release.yml` dit à GitHub : « **quand un tag qui
commence par `v` est poussé sur le dépôt, construis l'installeur Windows et
crée une release avec** ». Un **tag** est simplement une étiquette posée sur un
commit (une photo du code à un instant T), par exemple `v1.0.1`.

Autrement dit : **tu n'as jamais besoin de construire l'installeur sur ta
machine pour distribuer une version**. GitHub le fait à ta place, gratuitement.

### Le rituel, étape par étape

Quand tu as terminé des modifications et que tu veux les livrer aux
utilisateurs :

**1. Augmente le numéro de version** dans `package.json` :

```json
"version": "1.0.1",
```

**2. Enregistre et pousse ton code** :

```bash
git add -A
git commit -m "Description de ce qui a changé"
git push
```

**3. Pose l'étiquette (tag) et pousse-la.** Le nom du tag doit correspondre à
la version, précédé d'un `v` :

```bash
git tag v1.0.1
git push origin v1.0.1
```

**4. Attends ~5 minutes.** Va sur l'onglet
[Actions](https://github.com/galaxiel/GestyLoc/actions) du dépôt : tu vois le
build se dérouler. Quand il devient vert, une **draft release** (brouillon)
apparaît dans l'onglet
[Releases](https://github.com/galaxiel/GestyLoc/releases) avec l'installeur
`gestyloc-1.0.1-setup.exe` et le fichier `latest.yml`.

**5. Publie le brouillon.** Clique sur la release, complète si tu veux les
notes de version (elles seront affichées aux utilisateurs), puis clique sur
**Publish release** (bouton vert). La version devient téléchargeable
publiquement.

**6. C'est tout.** Les installations existantes détectent la nouvelle version
au prochain lancement de GestyLoc : notification native, téléchargement sur
accord de l'utilisateur, installation au redémarrage. Aucune action manuelle
de ta part.

### En résumé

```bash
# version dans package.json + commit + push, puis :
git tag v1.1.0 && git push origin v1.1.0
# ~5 min plus tard : Publish sur GitHub → l'auto-update fait le reste
```

### Cas particulier : publier depuis sa propre machine

C'est possible (utile si GitHub Actions est indisponible) : crée un token
GitHub avec droit `repo` (voir `.env.example`), puis :

```bash
GH_TOKEN=ton_token npx electron-builder --win --publish always
```
