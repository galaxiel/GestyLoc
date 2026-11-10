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

État actuel : **v1.17.1 publiée** (06/11/2026, tag `v1.17.1`) ; `main` porte en
plus **5 commits non poussés** (session 10/11/2026) : Finition P3 — sauvegarde
automatique hebdomadaire (`shared/sauvegarde.ts`), notification Windows des
alertes urgentes au démarrage (`shared/notifications.ts`), décomptes de
régularisation en lot (`shared/nom-fichier.ts`), export PDF du récap 2044
(`shared/fiscalite.ts`) + doc (`461c702`). Historique publié : v1.17.0
(remise à zéro de l'app : Paramètres → Zone de danger, sauvegarde automatique
avant effacement) puis v1.16.x (échéancier réel, rapprochement bancaire + v2,
avis d'échéance, relances, contrat pré-rempli, traçage assurance, table
`baux_revisions`, lint vert, harnais BDD, fixtures de 30 dossiers synthétiques).
Tout le publié est **commité et poussé** ; les 6 commits du 10/11/2026 sont
également **poussés sur `origin/main`** (aucun push de tag/release sans ordre du
propriétaire — la prochaine version publiée reste à décider, v1.18.0 candidate).
Détails dans ROADMAP
(« Session 10/11/2026 », « Session 03/11/2026 », « Session 04/11/2026 »,
« Session 06/11/2026 »). **Étude Best-of-N** (révision IRL + prorata — verdict :
code actuel juste, 15 divergences = ambiguïté de spec sur dates inexistantes,
6 « NON DÉTERMINÉ » à trancher côté produit) : sur la branche
`essais/best-of-n` (5 commits, poussée, NON fusionnée — fusion à la décision
du propriétaire) ; verdict dans `docs/tests/BEST-OF-N.md` sur cette branche.
⚠️ **Chemin du clone de travail : `D:\Bureau\Applications\GestyLoc`** (déplacé
le 10/11/2026 ; l'ancien `D:\Bureau\projet gestion locative\gestion-locative`
est un doublon que le propriétaire supprime — ne JAMAIS éditer l'ancien).
Les données réelles de l'utilisateur (16 baux) sont déjà importées dans sa base
locale. Considère toute case cochée de `ROADMAP.md` comme faite, ne la refais pas.

## 2. Stack et versions (IMPORTANT — compatibilités fragiles)

| Élément        | Version                                  | Pourquoi c'est critique                                                                                                                                  |
| -------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron       | **40.9.3** (`^40.9.3` dans package.json) | Choisi car le binaire était disponible ; `better-sqlite3@11` **ne compile PAS** contre Electron 39+ (API V8 `GetIsolate` supprimée). Ne pas descendre.   |
| better-sqlite3 | **12.11.1 minimum**                      | La v12 utilise **Node-API** (stable entre versions). Ne jamais repasser en v11.                                                                          |
| Node.js local  | 26.3.1                                   | Aucun binaire précompilé better-sqlite3 pour Node 26 → la compilation échoue si le module est compilé pour Node. Il DOIT être compilé pour **Electron**. |
| React / TS     | 19.x / 5.9                               | Standard.                                                                                                                                                |
| Tailwind       | **v3.4** (pas v4)                        | Choix délibéré pour stabilité. Ne pas migrer en v4 sans raison.                                                                                          |

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
  repositories/    1 fichier par entité (bien, locataire, bail, paiement,
                   dépense, régularisation, paramètres)
  services/        Logique métier : alertes, documents, quittances,
                   indices (INSEE), email (SMTP/nodemailer), reçu (partiel),
                   audit (contrôle d'intégrité), import, données

src/preload/       Pont contextBridge : définit window.api (l'unique surface
                   d'appel renderer → main). Typé via index.d.ts.

src/renderer/      Application React (HashRouter)
  pages/           1 page = 1 module (Dashboard, BiensLocataires, BailDetail,
                   BienDetail, Paiements, Quittances, Documents, Statistiques,
                   Simulateur, Depenses, Regularisation, Parametres)
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
   - entrée `{ id: '000N', name: 'xxx', sql: xxxSql }` **à la fin de la liste**
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
npm run lint         # eslint — 0 erreur / 0 warning exigé (aussi en CI release)
npm test             # vitest — 146 tests (modules purs de shared/ + format renderer)
npm run test:db      # harnais BDD via Electron — 42 tests, 1 fichier par entité
npm run test:coverage # couverture shared/ (seuils bloquants 80/70/80) — cf. docs/tests/ETAT-HARNAIS.md
npm run build        # typecheck + build electron-vite
npm run build:win    # typecheck + build + installeur NSIS dans dist/
npm run build:unpack # build + dossier non packagé (test rapide sans installeur)
npm run db:generate  # génère une migration depuis schema.ts (drizzle-kit)
```

Les tests vitest (`npm test`, dossier `tests/`) couvrent les utilitaires purs
de `shared/csv.ts`, `shared/stats.ts`, `shared/echeancier.ts`,
`shared/rapprochement.ts`, `shared/relances.ts`, `shared/sauvegarde.ts`,
`shared/notifications.ts`, `shared/nom-fichier.ts` et `shared/fiscalite.ts`
— 146 tests (couverture shared/ : ~95,8 % statements / 86,4 % branches /
98,6 % lignes, seuils 80/70/80/80 bloquants via
`npm run test:coverage`). Ils tournent
sur Node pur : ne les fais PAS importer des modules qui chargent
better-sqlite3 (incompatibilité de moteur, voir §2). Pour la BDD, utiliser
le harnais `npm run test:db` (§8, session 2) — pas besoin de script ad hoc.
Pour tester la BDD, ajouter un fichier dans scripts/test-db/ (1 fichier par
entité, auto-contenu, enregistré dans main.ts — cf. docs/tests/ETAT-HARNAIS.md
pour l'état complet, les preuves de mutation et les défauts documentés). Pour
fumer-tester rapidement un module qui touche la BDD : écrire un script temporaire et le lancer avec
`./node_modules/.bin/electron script.js` (le module natif ne charge que dans
Electron), puis supprimer le script.

## 7. Auto-mise-à-jour et releases

- `electron-builder.yml` → `publish: github, owner: galaxiel, repo: GestyLoc,
releaseType: draft`.
- L'updater vérifie au lancement **en production seulement** (désactivé en dev
  via `is.dev`). Flux : check → notif native + event IPC → téléchargement sur
  accord utilisateur → install au redémarrage. `autoDownload: false` est
  volontaire (cahier des charges).
- Le renderer s'abonne aux événements via `window.api.updater.on(...)` ; les
  noms de canaux sont dans `shared/updater-channels.ts`.
- **Release** : bump `package.json` → commit → **lint + tests verts en local** →
  `git tag vX.Y.Z` → push → GitHub Actions construit, vérifie les 4 assets et
  écrit les empreintes SHA-256 dans la draft → publier la draft sur GitHub.
  Rituel détaillé pas à pas : `CONTRIBUTING.md` §« Publier une nouvelle
  version ». Ne pas revenir à `electron-builder --publish always` : c'est cette
  voie qui créait deux drafts et perdait le `.blockmap`.

### Publication (depuis v1.12.1 : déterministe, plus de bug de drafts)

Le workflow ne passe PLUS par `electron-builder --publish` (bug : créait deux
drafts et perdait le blockmap). Il build avec `--publish never`, zippe
l'app complète + un marqueur PORTABLE (le zip portable détecte ce marqueur
au démarrage : données dans un dossier `donnees` à côté de l'exe), puis
crée UN draft et upload 4 fichiers vérifiés (échec explicite si un manque) :
`GestyLoc-X.Y.Z-setup.exe` + `.blockmap` + `GestyLoc-X.Y.Z-portable.zip` +
`latest.yml`. L'exe portable autonome a été supprimé (décision utilisateur).

### Empreintes SHA-256 (intégrité des téléchargements)

L'app n'étant **pas signée** (voir le paragraphe « Pourquoi pas de signature de
code » ci-dessous), Windows ne peut rien affirmer
sur l'éditeur : le seul contrôle offert à l'utilisateur est l'empreinte du
fichier. Le workflow calcule donc le SHA-256 des 4 assets après l'upload et
l'écrit dans les **notes de la draft**, sous le titre `### Empreintes SHA-256`.

- Ce n'est **pas un 5e asset** : la règle « exactement 4 assets » tient
  toujours, et `electron-updater` n'en saurait rien faire.
- Le bloc est **recalculé et remplacé** à chaque exécution (il est tronqué au
  marqueur avant réécriture) : pas de doublon sur une relance de tag.
- À la publication manuelle de la draft, **ne pas le supprimer** : c'est la
  seule preuve d'intégrité disponible, et le README y renvoie.
- Vérification locale : `certutil -hashfile <fichier> SHA256`.

**Pourquoi pas de signature de code** (décision à ne pas rouvrir sans ordre) :
un certificat OV coûte 150–300 €/an avec **token matériel obligatoire** depuis
2023, et **Azure Artifact Signing** (ex-Trusted Signing, ~9,99 $/mois) n'ouvre
les particuliers qu'aux **USA et Canada** — donc fermé à l'auteur, particulier
en France. Et depuis 2024 un certificat, même EV, **ne supprime pas l'alerte
SmartScreen** à la première release : la réputation se construit release après
release. Seule voie gratuite sans avertissement : un paquet **MSIX publié sur
le Microsoft Store** (inscription développeur individuelle gratuite), à
étudier avant tout achat de certificat.

### Autre piège

`resources/app-update.yml` (fichier lu par l'updater en production) n'est
généré que pour les cibles d'installation (NSIS), **pas** pour `--dir`. Un
échec updater « ENOENT app-update.yml » sur un build `--dir` est donc normal.

## 8. Fonctionnalités livrées (v1.0.0 -> v1.9.0) — ne pas refaire

- CRUD complet biens/locataires/baux (formulaire unifié « ligne tableur »),
  avec statut **occupation gratuite** (badge, exclus des loyers/quittances/
  alertes/paiements)
- Dashboard : stats (loyers CC mensuels, encaissé ce mois, surface) + alertes
  (fins de bail < 90 j via `alertes.service.ts`, révisions IRL > 1 an, impayés)
- Quittances : pdfmake **côté renderer** (polices via `vfs_fonts`, branchement
  tolerant aux formes de module — voir `pages/Quittances.tsx`), export PDF via
  dialog natif, impression système, **génération en lot** (1 mois -> tous les
  baux payants dans un dossier), pré-remplies avec le **profil bailleur**
  (table `parametres`, clé 'bailleur')
- Paiements : upsert par (bail_id, période) — clé composite en BDD
- **Fiche détaillée bail** (`pages/BailDetail.tsx`, route `/baux/:id`) :
  infos, historique paiements, documents, **révision IRL guidée** (calcul
  nouveau loyer = HC x IRL_nouveau/IRL_ref arrondi au centime, application
  en 1 clic avec date_derniere_revision)
- Documents : service main complet (copie vers AppData, chemin en BDD),
  IPC `docs:*`, page React dédiée + section dans la fiche bail
- **Statistiques** (`pages/Statistiques.tsx`) : encaissements 12 mois (barres
  CSS, pas de lib de graphiques), répartition par type de bien, loyer/m²
- Données (Paramètres + `services/donnees.service.ts`, `import.service.ts`) :
  export CSV Excel-fr (4 tables), sauvegarde/restauration de la base
  (checkpoint WAL + relaunch), import CSV avec aperçu et anti-doublon
  (mapping par index de colonnes = format du tableur Google Sheets de
  l'utilisateur, parsers dans `shared/csv.ts` testés)
- Raccourcis clavier : Ctrl+1..7 navigation, Ctrl+N nouveau bail
  (`RaccourcisClavier` dans `App.tsx`)
- Thème clair/sombre : Tailwind `darkMode: 'media'` (suit l'OS) ;
  `nativeTheme.themeSource = 'system'`
- Icône : logo utilisateur converti en `build/icon.ico` (16-256 px, entrées
  PNG) + `resources/icon.png` (256 px, importé par main/index.ts)

### Ajouts v1.4 -> v1.9 (ne pas refaire)

- **Statistiques recharts** (encaissements 12 mois, camembert, comparaison
  annuelle, 6 KPI dont taux d'occupation/impayés/charges) + section
  **Patrimoine & rentabilité** (valeur vénale par bien, rentabilité brute/nette,
  cash-flow, gains IRL estimés)
- **Indices IRL/ICC depuis INSEE** (`services/indices.service.ts`, SDMX public
  001515333/000008630, bouton dans la fiche bail)
- **Module Dépenses** (page + `depense.repository.ts`, catégories
  travaux/PNO/taxe foncière/...) et **Régularisation des charges**
  (migration 0007, décompte PDF art. 23)
- **Récap fiscal 2044** (Statistiques) : recettes/charges déductibles/résultat,
  micro-foncier vs réel — **biens meublés exclus** (BIC/LMNP)
- **Matrice de pointage** Mois × Biens avec 4 statuts (payé/partiel avec montant
  saisi/retard/impayé) + mode de règlement + tri stable
- **Fiche Bien** (`/biens/:id`) : caractéristiques fixes, historique des
  locataires passés, documents rattachés au bien (`bien_id` déjà en base)
- **DPE** (badge couleur), dépôt de garantie, type de charges (migration 0005),
  filtres rapides du tableau
- **Historique des quittances** (migration 0006, upsert bail+période)
- **Email** : SMTP configurable dans Paramètres (stocké dans `parametres`, mot
  de passe jamais envoyé au renderer via `getSmtpConfigPublic()`), bouton
  « Envoyer au locataire » + invitation si non configuré (nodemailer)
- **Conformité quittances (v1.8)** : génération en lot filtrée sur les loyers
  POINTÉS « payé » de la période (art. 21), avertissement adresse manquante
- **Alerte IRL à l'anniversaire du bail** (art. 17-2), doublons locataires
  détectés à la création, formulaire : trimestre IRL en LISTE + taux IRL
  VERROUILLÉ (recalculé de la paire)
- **Import CSV durci** (v1.9) : champs dérivés TOUJOURS recalculés (annuels,
  loyer/m², CC, taux), adresse/ville déduites de la désignation si n° de rue
- **v1.11-1.12** : table IRL embarquée (`shared/irl-insee.ts`, régénérée par
  `scripts/update-irl.py` + workflow trimestriel `update-irl.yml`), révision
  bail pilotée par trimestre, libellés uniques (`shared/labels.ts` : « Type ·
  Désignation — Locataire » partout), reçu PDF pour paiement partiel
  (`services/recu.service.ts`), audit de données (`services/audit.service.ts`,
  canal `data:audit`, UI dans Paramètres), licence PolyForm Noncommercial

### 🚨 Piège historique à connaître (bug v1.0->v1.12, corrigé)

Le formulaire d'édition de bail envoyait `bien_id: 0, locataire_id: 0` dans le
payload d'UPDATE → `FOREIGN KEY constraint failed`. Règle : **les clés
étrangères ne changent jamais en édition** — les exclure du payload
(`const { bien_id, locataire_id, ...champs } = input`). Idem pour toute
nouvelle table avec FK.

- **Statistiques 2.0 + Simulateur** (v1.10-1.11) : segmentation par type
  avec unités propres (€/m² logements, €/emplacement garages), médiane/
  quartiles, liste des suspects (> 15 % sous la médiane), simulateur de
  rattrapage IRL (INSEE réel ou taux fixe), seuil micro-BIC vs réel (LMNP)
- **Quittance refondue** (v1.14) : adresses complètes bailleur (profil
  structuré rue/CP/ville) et locataire (migration 0009), « bien » au lieu de
  « logement », formulation non genrée, « Fait à » prérempli, sans signature
- **Références de quittances** (v1.15) : QUITT-{AAAA}{MM}-{ID_BAIL}
  (`shared/quittance-ref.ts`), sur le PDF (haut droite), colonne historique,
  objet des emails, export quittances.csv (migration 0010 rétro-appliquée)
- **Emails** : envoi individuel + EN GROUPE des quittances (bouton Envoyer
  tout), email de demande d'attestation d'assurance (fiche bail)
- **Menu quittances complet** : tous les baux listés (marqueur ✓ payé /
  loyer non pointé) + confirmation art. 21 si génération sans pointage
- **Alertes** : assurance à demander (30 j avant l'anniversaire du bail)

### Chantier v1.16-dev (03/11/2026, livré en v1.16.0)

- **Échéancier réel** : `baux.jour_paiement` (migration 0011, défaut 1),
  prorata du 1er mois en **jours civils** (`shared/echeancier.ts`, 12 tests —
  module pur utilisé par main ET renderer), calendrier des échéances sur le
  Dashboard, colonne « Montant dû / Échéance » dans Paiements, alerte de retard
  (jour de paiement + marge, paramètre `echeancier` = `{ marge_retard_jours }`,
  réglable dans Paramètres).
- **Rapprochement bancaire** : `shared/rapprochement.ts` (12 tests, pur) +
  section « Rapprochement bancaire » de la page Paiements. Le CSV du relevé est
  lu **dans le renderer via FileReader** (aucun fs, aucune IPC nouvelle) —
  parsing (séparateur `;`/`,` + BOM auto) puis matching montant ± 1 ct ×
  (période pointée, mois de l'opération, mois précédents) × nom du locataire ;
  ambigu = « à revoir ». La validation en masse upsert des paiements statut
  `paye`, `reference` = libellé bancaire, `notes` = 'Rapprochement bancaire'.
- **`shared/rapprochement.ts`** et **`shared/echeancier.ts`** : modules purs
  testés, même contrat que `csv.ts`/`stats.ts` — ne pas y importer Node/Electron.
- **Table `baux_revisions`** (migration 0012) : historique des révisions,
  alimentée par `BailDetail.appliquerRevision()`, canal `db:revisions:*`,
  repository `bail-revision.repository.ts`. Affichée dans la fiche bail.
- **Reçu de paiement refondu** (`recu.service.ts`) : contrat `RecuParams` =
  `{ row, bailleur: ProfilBailleur | null, periode, montantRecu, modePaiement }`
  (profil structuré rue/CP/ville, plus de `adresseBailleur` string) ; montant
  attendu PRORATISÉ via `montantAttendu()`.
- **Durcissement sécurité** : `window.electron` (electronAPI) n'est PLUS exposé
  au renderer — il donnait un `ipcRenderer` brut sur tous les canaux. Toute
  l'app passe par `window.api` ; `app.getVersion` est exposé via
  `api.app.getVersion()` (Sidebar et Parametres utilisent ça). `index.d.ts` ne
  déclare plus `window.electron`. Si un jour il faut un nouveau canal, l'ajouter
  DANS l'objet `api` du preload, jamais via un accès générique.
- **schema.ts reflète EXACTEMENT les migrations** : `quittances.reference_number`
  - index uniques `idx_quittances_bail_periode` / `idx_quittances_reference`
    (0006/0010) sont déclarés dans schema.ts avec `uniqueIndex()`/`index()` —
    sinon un futur `db:generate` produirait des DROP destructeurs (bug corrigé
    le 03/11/2026).
- **`shared/csv.ts`** : `parseCsv` détecte le séparateur (`;` Excel-fr vs `,`)
  et strippe le BOM — l'import accepte désormais les exports Excel-fr ;
  `frDate` refuse les dates fantômes (31/02/2024 → null) ; `csvCell` échappe `\r`.
- **`shared/stats.ts`** : un bien sans surface (segment m2) ou sans loyer est
  EXCLU des ratios (plus de faux « suspects » à −100 %) ; `manqueAGagnerAnnuel`
  est en euros RÉELS (€/m²/mois × 12 × surface) ; dates parsées en local
  (`parseIsoLocal`), anniversaire 29/02 borné au 28/02, trimestre ancré
  `/\bT([1-4])\b/`.
- **`referenceQuittance()`** lève si `periode` ≠ `yyyy-mm` (protège l'index unique).
- **Tests : 61** (csv, stats, echeancier, rapprochement). Release workflow :
  `npm ci` + `npm test` avant build (bloque une release rouge).
- **Environnement de dev de la machine** (npm récent) : les scripts postinstall
  sont BLOQUÉS par défaut (`npm install-scripts`) — après un `npm install`
  neuf : approuver electron/better-sqlite3/esbuild, `npx electron-rebuild -f
-w better-sqlite3` (sinon NODE_MODULE_VERSION 147 vs 143), et si le binaire
  Electron ne se télécharge pas : le zipper manuellement depuis
  github.com/electron/electron/releases (v40.9.3, win32-x64) vers
  `node_modules/electron/dist` + `path.txt` = `electron.exe`.

### Chantier v1.16-dev — session 2 (04/11/2026, livré en v1.16.0)

- **Avis d'échéance** (`Quittances.tsx`, `construireAvisEcheance`) : rappel du
  loyer À VENIR du mois suivant, même référence QUITT, document distinct de la
  quittance. Échéancier réel intégré : montant proratisé (`montantAttendu`) +
  date d'échéance = jour de paiement du bail (`echeanceIso`). Sauvegardé SANS
  trace dans l'historique des quittances (ce n'est pas une quittance).
- **Relances d'impayés** (`shared/relances.ts` — pur, 5 tests + bouton ✉ dans
  Paiements) : 3 niveaux (courtoise / ferme / mise en demeure), objet + corps
  préremplis, l'utilisateur relit puis : email (SMTP), copie presse-papiers, ou
  lettre PDF (`construireLettreRelance` dans Paiements). JAMAIS d'envoi auto.
- **Contrat de location pré-rempli** (`contrat.service.ts` côté main, canal
  `contrat:pdf`, bouton « Contrat » de la fiche bail) : modèle indicatif loi
  1989 nu (3 ans) / meublé (1 an), jour de paiement et prorata intégrés,
  mention « modèle à adapter » — GestyLoc ne rédige pas de contrat définitif.
- **Traçage assurance** (migration 0013, `baux.assurance_demandee_le`) : datée
  par `demanderAssurance()` de la fiche bail après envoi réussi ; l'alerte
  anniversaire est SUPPRIMÉE si la dernière demande a moins de 330 jours.
- **Rapprochement v2 (règles mémorisées)** : paramètre `rapprochement` =
  `{ regles: { cléLibellé → bailId } }` où `cleRegle()` = libellé normalisé
  SANS chiffres. Passées en 4e argument de `proposerPointages` : une règle
  reconnue prime sur le nom (confiance haute, motif « Règle mémorisée ») et
  lève l'ambiguïté de montant. Sauvegardées à chaque validation en masse ;
  bouton « Oublier les règles » dans la section.
- **Simulateur** : colonne « Dernière révision appliquée » (baux_revisions via
  `db:revisions:list-all` → `ipc.revisions.listAll()`) : comparatif théorique
  (simulation) vs réellement appliqué, bail par bail.
- **Lint VERT (0/0)** : `.gitattributes` (`* text=auto eol=lf`) + prettier
  `endOfLine: auto` ; 2 règles OFF documentées dans eslint.config.mjs
  (`react-hooks/set-state-in-effect` — pattern de chargement voulu — et
  `react/prop-types` — TS couvre) ; disables BLOCS pour le branchement
  pdfmake/vfs (les `// eslint-disable-next-line` mono-ligne ne couvrent PAS
  les chaînes multi-lignes — piège récurrent de ce repo) ; `npm run lint`
  dans la CI de release. `scripts/test-db/bundle.mjs` est ignoré du lint.
- **Harnais tests BDD** : `npm run test:db` = esbuild (bundle ESM, externals
  electron/better-sqlite3, alias @shared) + `electron scripts/test-db/bundle.mjs`.
  Le bundle redirige `app.setPath('userData')` vers un dossier TEMPORAIRE
  (jamais la vraie base !), applique les .sql réels, 8 assertions sur
  repositories + alertes + paramètres. Tests de date volontairement bornés
  (pas de flaky) : les calculs calendaires purs restent dans vitest.
  ⚠️ Éviter les `await import()` dynamiques dans ce harnais (esbuild renomme
  mal les bindings) : imports statiques.
- **Tests : 70 vitest + 8 BDD.**

### Outillage démo/tests (06/11/2026, livré en v1.16.1 — code de l'app inchangé)

- **`scripts/gen_demo_30.mjs`** : générateur DÉTERMINISTE de 30 dossiers
  locatifs synthétiques (`--seed`, défaut 20261106 ; `--out` ; `--dry-run`).
  Même seed → fichiers identiques au bit près (PRNG mulberry32, démo figée à
  novembre 2026, aucune date courante). Sorties dans `fixtures/demo-30/` :
  `baux.csv` (format d'import de l'app, mapping par index 0..20), `paiements.csv`
  (format d'export, bail_id = ordre de ligne de baux.csv sur base neuve),
  `dossiers.json` (manifest : compléments post-import + valeurs attendues),
  `README.md` (les 30 dossiers + limites).
- **`scripts/check_demo_30.mjs`** : vérificateur — régénère les fixtures et
  compare au bit près, puis importe baux.csv dans une base SQLite TEMPORAIRE
  (patron du harnais test:db : `app.setPath('userData')` vers un tmpdir) avec
  les vraies migrations, applique les compléments du manifest (dépôt, type de
  charges, congés, révisions IRL, régularisations, fusion de colocation),
  charge paiements.csv, et prouve 13 invariants avec le VRAI code de l'app
  (`shared/echeancier.ts`, `alertes.service.ts`). Sortie : tableau 30 lignes,
  exit 0. La base temporaire est SUPPRIMÉE à la fin.
- **⚠️ Garde-fous non négociables** : ne JAMAIS lire/écrire
  `%APPDATA%\gestyloc\data\app.db` (16 baux réels du propriétaire) — tout le
  harnais passe par une base temporaire ; aucune donnée personnelle réelle
  dans les fixtures (noms 100 % fictifs, indices IRL publics INSEE tirés de
  `shared/irl-insee.ts`) ; calculs du générateur volontairement indépendants
  du code de l'app (c'est ce qui rend le test de non-régression meaningful) ;
  limites métier documentées dans `fixtures/demo-30/README.md` (colocation =
  2 baux fusionnés post-import, restitution du dépôt non modélisée, paliers
  d'alerte = nombre d'alertes, taux_irl corrigé post-import).

### Étude Best-of-N (06-07/11/2026, branche `essais/best-of-n` — NON fusionnée)

- **Méthode** : contrat gelé (`essais/best-of-n/CONTRAT.md` sur la branche) →
  8 tentatives indépendantes par sous-agents (limité à 2 simultanés —
  relances en vagues, notées) → jeu scellé de 2 000 cas (seed 777777,
  étanchéité prouvée : 0 trace dans les attempts) → jugement par un oracle
  écrit indépendamment des règles du contrat.
- **Verdict** : code actuel JUSTE sur 2 485/2 500 cas (unanimité 9 colonnes +
  oracle). 0 « UNANIMITÉ KO ». 15 divergences — toutes sur des DATES DE DÉBUT
  INEXISTANTES (30/02, 31/06, 29/02 non bissextile) : rollover `Date()`
  (actuel + oracle + 6) vs rejet R8 (attempt-3) vs mois littéral
  (attempt-6/7) → ambiguïté de spec NON DÉTERMINÉE, impact utilisateur nul
  (champ date HTML). **Aucune fusion** : rien ne justifie de remplacer le code.
- **6 « NON DÉTERMINÉ » à trancher côté produit** (liste complète dans
  `docs/tests/BEST-OF-N.md` §5, sur la branche) : 1) date de début
  invalide → rejet ou rollover ; 2) indice COURANT ≤ 0/manquant (R6 ne cite
  que le précédent — 5 tentatives sautent aussi, le code actuel non) ; 3) prorata de sortie (aucune règle sourcée — sonde ignorée par les 8) ; 4) borne temporelle non injectable dans `simulerRattrapageIrl`
  (`new Date()` interne) ; 5) taux fixe 0 compté comme révision jouée ; 6) méthode du prorata (jours civils vs dixièmes).
- La branche contient aussi : `essais/best-of-n/attempt-1..8/` (les
  implémentations candidates + NOTES), `jugement/matrice.json` (matrice
  brute cas × implémentation), `jugement/oracle.mjs` (référence du contrat).
  Tentative notable si le produit durcit un jour la validation d'import :
  attempt-3 (rejet strict des dates inexistantes) ; attempt-4/8 (date
  système gelée en constante → fonctions pures, utile si R10 devient
  injectable).

### Finition P3 (10/11/2026, `main` — poussé sur `origin/main`)

Quatre fonctionnalités, un lot = un module pur dans `shared/` (donc testé en
vitest et réutilisé par l'UI). Commits `9f5cc6b`, `ecd4883`, `9c47673`,
`1ac2535` + doc `461c702`. **Ne pas refaire** (cases cochées dans ROADMAP §Finition).

- **Sauvegarde automatique hebdomadaire** (`shared/sauvegarde.ts`, 10 tests +
  2 BDD) : au démarrage, `setTimeout(15 s).unref()` appelle
  `executerSauvegardeAuto()` (dans `donnees.service.ts`) — au plus une fois par
  7 jours, copie WAL-checkpointée dans `userData/backups/auto_<date>_<heure>.db`,
  rotation des 5 plus récentes (`rotationSauvegardes`) ; les fichiers
  `avant_restauration_*`/`avant_remise_a_zero_*` ne sont JAMAIS touchés. État
  dans `parametres` clé `sauvegarde_auto` (`{ derniere }`), affiché dans
  Paramètres.
- **Notification Windows des alertes urgentes** (`shared/notifications.ts`,
  4 tests) : `notifierAlertesUrgentes(win)` au démarrage dans `index.ts`
  (même patron que l'updater) résume les alertes `severite: 'urgent'`
  (3 détaillées max puis « … et N autres ») ; clic → `win.show()/focus()`.
  Silencieuse s'il n'y a rien ; jamais fatale.
- **Décomptes de régularisation en lot** (`shared/nom-fichier.ts`, 7 tests) :
  bouton « Générer tous les décomptes » dans `Regularisation.tsx` — un PDF par
  bail de l'année dont les charges réelles sont saisies, dossier choisi une
  fois via `ipc.quittances.chooseFolder()`, puis `saveTo` (sans traçage : c'est
  un décompte, pas une quittance), progression + compteur d'erreurs.
- **Export PDF du récap 2044** (`shared/fiscalite.ts`, 6 tests) : le calcul du
  récap (recettes hors meublés, charges déductibles, seuil micro 15 000 €
  inclusif, net micro 70 %, net réel borné à 0, ventilation par bail) a été
  EXTRAIT de `Statistiques.tsx` en module pur `calculerRecap2044()`, partagé
  entre l'écran et le PDF (`recap2044Data()`, sauvegarde `recap_2044_<annee>.pdf`).
- **Corrections d'outillage** : `electron-log` externalisé du bundle `test:db`
  (`package.json` — sinon `donnees.service` cassait le require sous esbuild) ;
  `essais/**` ajouté aux `ignores` d'`eslint.config.mjs` (les bundles esbuild de
  l'étude Best-of-N généraient 708 faux problèmes de lint).
- **État harnais** : 146 vitest + 42 BDD, lint 0/0, `check_demo_30` 13
  invariants, `npm run build` vert. 5 preuves de mutation (fichier inversé puis
  restauré). Détail : `docs/tests/ETAT-HARNAIS.md`.

### 🚨 Pièges runtime à connaître

- **`window.prompt()` n'existe PAS dans Electron** — toute saisie se fait
  par un modal React (le bug « marquer partiel » venait de là)
- **Clés étrangères** : jamais envoyées dans un UPDATE (le formulaire de
  bail envoyait `bien_id: 0` → FOREIGN KEY constraint failed, bug v1.0-v1.12)
- **Anti-ré-application IRL** : après application, la sélection est
  réinitialisée ; un IRL nouveau déjà enregistré est refusé (sinon chaque
  clic ré-incrémentait la révision)

## 9. Prochaines étapes

Lire `ROADMAP.md` (source de vérité). Restants (aucun bloquant) :

- **Publier v1.18.0** (Finition P3) — bump `package.json` + rituel
  CONTRIBUTING, **UNIQUEMENT sur ordre explicite du propriétaire** (jamais
  taguer/publier de sa propre initiative). Les 6 commits sont poussés sur `main`.
- Corriger les IRL des 15-16 baux réels importés (paires non légales héritées du
  tableur — l'outil embarqué de la fiche bail le fait en 2 min chacun)
- **6 « NON DÉTERMINÉ » de l'étude Best-of-N** à trancher côté produit — détail
  dans `docs/tests/BEST-OF-N.md` §5, ⚠️ fichier présent uniquement sur la
  branche `essais/best-of-n` (non fusionnée) :
  `git show essais/best-of-n:docs/tests/BEST-OF-N.md`. Sujets : rejet vs
  rollover des dates d'import inexistantes, prorata de sortie, indice courant
  invalide, borne temporelle non injectable (`new Date()` interne), taux fixe 0
  compté comme révision jouée, méthode du prorata (jours civils vs dixièmes)
- **Fixture D15** : paire IRL illégale T3 2024→T3 2026 (la réf. devrait être
  T3 2025 = 145.77) — corriger `scripts/gen_demo_30.mjs`, régénérer les fixtures
  et re-valider `check_demo_30` (cf. ETAT-HARNAIS.md, « Défauts documentés » §5)
- ROADMAP « À faire » : table `emprunts` (cash-flow/TRI), modèle B (clé de
  répartition des charges), automatisation Google Apps Script (HORS app)
- **Vagues produit** (décision propriétaire) : état des lieux numérique, modèles
  de lettres, SEPA/portail locataire, IA locale (Ollama), version anglaise
- Signature de code (SmartScreen) : étudier MSIX/Microsoft Store AVANT tout
  certificat — cf. §7 « Pourquoi pas de signature de code » et ROADMAP
- Licence : PolyForm Noncommercial (usage commercial réservé au SAS projet)

## 10. Environnement humain

- Utilisateur : **galaxiel** (GitHub), Windows 11, parlant français —
  communique en français.
- Clone de travail : **`D:\Bureau\Applications\GestyLoc`** (référence unique
  depuis le 10/11/2026 — l'ancien chemin `D:\Bureau\projet gestion locative\
gestion-locative` est un doublon en cours de suppression, à ne pas éditer).
- Pas de contrainte de serveur : tout est local et gratuit (GitHub Actions).
- Le token `GH_TOKEN` n'est nécessaire que pour publier une release depuis
  une machine locale ; GitHub Actions utilise `secrets.GITHUB_TOKEN` auto.
