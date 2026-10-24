# Roadmap — GestyLoc

> Suivi d'avancement du projet. Dernière mise à jour : 24/10/2026.

## ✅ V1.0 — MVP (TERMINÉ)

### Socle technique
- [x] Scaffolding electron-vite (Electron 40 + React 19 + TypeScript strict)
- [x] Tailwind CSS v3 avec thème clair/sombre suivant l'OS
- [x] Séparation stricte main / preload / renderer (`src/main`, `src/preload`, `src/renderer`, `shared/`)
- [x] Pont IPC sécurisé (`contextBridge`, `contextIsolation: true`, API `window.api` typée)
- [x] Enveloppe d'erreur standardisée `{ ok, data | error }` sur tous les handlers IPC

### Base de données
- [x] SQLite dans AppData (`%APPDATA%/gestion-locative/data/app.db`), mode WAL, 100 % local
- [x] Modèle normalisé 3 tables : `biens`, `locataires`, `baux` (les 19 colonnes du tableur mappées)
- [x] Tables `paiements` (clé composite anti-doublon) et `documents`
- [x] Runner de migrations versionnées (appliquées au démarrage, évolutif sans casse)
- [x] Schéma Drizzle ORM typé (`src/main/database/schema.ts`)

### Fonctionnalités
- [x] **Tableau de bord** : loyers mensuels CC, biens gérés, surface totale, alertes
- [x] **CRUD Biens & Locataires** : tableau "ligne tableur" + formulaire unifié (bien + locataire + bail)
- [x] **Quittances PDF** (pdfmake, conforme art. 21 loi 1989) → enregistrer sous (dialog natif)
- [x] **Suivi des paiements** : pointage Payé / Retard / Impayé sur 6 mois glissants
- [x] **Alertes automatiques** : fins de bail < 90 jours, révisions IRL > 1 an, loyers impayés + badge urgence sidebar
- [x] **Documents joints** : service complet côté main (copie AppData, chemin en BDD, ouverture OS, suppression)

### Mises à jour & distribution
- [x] electron-updater configuré (repo GitHub `galaxiel/GestyLoc`, draft releases)
- [x] Vérification au lancement → notif native → téléchargement sur accord → install au redémarrage
- [x] Installeur NSIS testé : `dist/gestion-locative-1.0.0-setup.exe`
- [x] GitHub Actions `.github/workflows/release.yml` : push d'un tag `v*` → build + draft release auto
- [x] Page Paramètres : version, vérification manuelle des mises à jour

---

## 🔜 V1.1 — Reprise des données réelles (priorité haute)

- [x] **Import du tableur Excel existant** (CSV → BDD) : *(données réelles importées le 24/10/2026)*
  - [x] Script de mapping colonnes tableur → tables `biens` / `locataires` / `baux`
  - [x] Interface d'import intégrée (Paramètres → Données → « Importer un tableur CSV ») : aperçu, confirmation, rapport
  - [x] Détection des doublons (refus si la base contient déjà des baux)
- [x] Profil **bailleur** (nom, adresse) dans Paramètres → pré-rempli dans les quittances (avertissement si vide)
- [x] Page **Documents** : interface React — sélection bail, ajout (dialog OS), ouverture, suppression

## ✅ V1.2 — Confort d'usage (TERMINÉ)

- [x] Fiche détaillée d'un bail (cliquer sur le nom du bien dans le tableau) : infos, historique paiements, documents
- [x] Calcul automatique de la révision IRL (dans la fiche du bail : IRL ref → nouveau loyer arrondi au centime, application en 1 clic avec date de révision)
- [x] Génération de quittances **en lot** (un mois → tous les baux payants, un PDF par locataire dans un dossier au choix)
- [x] Export des données (CSV Excel-fr : biens, locataires, baux, paiements)
- [x] Sauvegarde/restauration de la base (checkpoint WAL, copie de sécurité avant restauration, redémarrage auto)
- [x] Raccourcis clavier (Ctrl+1 à Ctrl+6 = navigation, Ctrl+N = nouveau bail)

## 🔮 V2 — pistes (démarré, non planifié)

- [ ] **Statistiques avancées** (DÉMARRÉ v1.3.0 : page Statistiques — encaissements 12 mois, répartition par type de bien, loyer moyen/m². Reste : taux d'occupation détaillé, suivi des charges, comparaison inter-annuelle)
- [ ] Impôts : récap annuel (formulaire 2042 cases foncières, micro-foncier vs réel)
- [ ] Multi-profils / multi-bailleurs
- [ ] Chiffrement de la base (mot de passe au lancement)
- [ ] Rappels par email (optionnel, nécessite connexion)
- [ ] Version portable (.exe sans installation)

---

## Bugs connus / dettes techniques

- [x] Montant « Encaissé ce mois » branché sur les paiements pointés (payé/partiel) de la période courante
- [x] Quittances : champs bailleur pré-remplis depuis le profil bailleur (v1.1.0)
- [x] Icône d'app personnalisée : logo GestyLoc converti en `build/icon.ico` multi-tailles (16→256 px) + `resources/icon.png` (v1.3.0)
- [x] Tests automatisés de premier niveau : vitest sur les utilitaires purs (parsers CSV, formats français) — `npm test` (11 tests)
- [ ] Étendre les tests aux repositories et au service d'alertes — **voir la section « Problématique du harnais de test » ci-dessous**

---

## 🧪 Problématique du harnais de test (dette technique expliquée)

> **Pourquoi tout le code n'est pas couvert par des tests automatiques ?**
> Ce n'est pas de la paresse : c'est une contrainte technique précise, décrite ici
> pour qu'un futur développeur (humain ou LLM) comprenne le problème avant de
> chercher à le résoudre.

### Ce qui est déjà testé

Les 11 tests (`npm test`, vitest) couvrent les **fonctions pures** : des calculs
qui ne touchent ni base de données ni fichiers système. On leur donne une
entrée, elles retournent une sortie, toujours pareil. Exemples : convertir
« 650,00 € » en 650, transformer « 19/10/2024 » en « 2024-10-19 », parser un
CSV avec des guillemets. Tester ça est trivial et ces fonctions protègent le
point le plus fragile (l'import de tableur).

### Ce qui n'est PAS testé, et pourquoi

Le reste du code (les **repositories** qui parlent à SQLite, le **service
d'alertes** qui lit la base) ne peut pas être testé sans créer une **mini base
de données de test** : la créer vide, y insérer des données fictives, vérifier
les résultats, tout jeter, et ça pour chaque test. Cette machinerie de
préparation s'appelle un **harnais de test** (*test harness*).

Le blocage est le suivant :

1. `better-sqlite3` est un module **natif** compilé pour le moteur d'**Electron**
   (voir l'historique du projet : recompilation obligatoire contre les headers
   Electron, sinon `NODE_MODULE_VERSION` mismatch au chargement).
2. L'outil de tests (vitest) tourne sur le moteur de **Node.js pur**, qui ne
   peut **pas charger** ce binaire — on l'a vérifié : le module s'ouvre dans
   Electron mais lève une erreur dans Node.
3. Donc pour tester les repositories, il faut un des 3 contournements :

| Option | Principe | Coût / inconvénient |
|---|---|---|
| **A. Base de test via `libsql`** | Drizzle supporte un pilote SQLite en pur JS/WebAssembly, compatible vitest | Écrire le code des repositories contre une abstraction, ou dupliquer les requêtes → risque de tester autre chose que le vrai code |
| **B. Lancer vitest dans Electron** | Utiliser Electron comme runtime de tests | Configuration fragile, lenteur, outillage peu documenté |
| **C. Recompiler better-sqlite3 pour Node dans les tests** | Deux compilations du même module selon le contexte | Casse la compilation Electron à chaque bascule — le plus risqué |

### Décision (état actuel)

Le rapport coût/bénéfice n'est pas favorable aujourd'hui : l'app est déjà
validée par (1) le **typecheck strict** à chaque build, (2) les tests de
parsing sur le point le plus fragile, (3) un **test manuel avant chaque
release** (l'app est lancée et vérifiée avant publication). Le jour où le
projet gagne en complexité (ou devient le socle d'un SaaS multi-locataires,
où une régression coûterait cher), l'**option A** est la plus propre : c'est
le chantier à ouvrir en priorité.
