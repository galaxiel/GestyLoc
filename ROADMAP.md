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

## 🔜 V3 — Revue d'usage complète (backlog détaillé, 25/10/2026)

> Issu d'une revue d'usage page par page. Légende : 🗃️ = migration BDD
> nécessaire · 🖥️ = UI uniquement (backend déjà prêt) · 🌐 = nécessite
> internet (exception au principe "100 % local", toujours en option)

### 1. Tableau de bord

- [x] 🖥️ **Trésorerie prévisionnelle** (v1.5.0) : carte "attendu ce mois" (somme des loyers CC
  des baux actifs payants) à côté de "encaissé ce mois" + **impayés cumulés en €**
  (somme des périodes pointées retard/impayé)
- [x] 🖥️ **Regroupement des alertes** (v1.5.0, accordéons) : quand le parc grandit, regrouper par type
  (ex : "12 révisions d'IRL en attente" avec accordéon ou page dédiée au lieu d'une
  longue liste verticale)
- [x] 🖥️ **Actions rapides** (v1.5.0), "Générer les
  quittances du mois", "Ajouter un bien" en tête du dashboard

### 2. Biens & Locataires

- [ ] 🗃️ **DPE** (classe A→G) sur le bien — obligatoire en France, interdiction
  progressive des passoires thermiques : colonne `dpe` + filtre + affichage couleur
- [ ] 🗃️ **Dépôt de garantie** sur le bail (montant, date de réception) + suivi de la
  restitution en fin de bail
- [x] 🗃️ **Type de charges** (v1.5.0) : forfaitaires vs provisionnelles (avec régularisation
  annuelle) — impacte les décomptes
- [x] 🖥️ **Filtres et tris** du tableau (v1.5.0 : chips Tous/Appartements/Garages/Fin<6 mois/Gratuits/Vacants + badge DPE) : par type (appartement/garage), baux finissant
  < 6 mois, baux gratuits, vacants
- [x] 🖥️ **Fiche Bien dissociée de la fiche Bail** (v1.5.0, route /biens/:id) : la base de données est DÉJÀ
  normalisée (tables `biens` et `baux` séparées) — ce qui manque est l'UI : une page
  "Biens" listant les biens indépendamment des baux, avec l'**historique des
  locataires passés** (baux `actif = false`) et le détail du bien actuel. Permet de
  changer de locataire sans jamais toucher à la fiche du bien.

### 3. Suivi des paiements

- [x] 🖥️ **Vue matrice Mois × Biens** (v1.5.0 : pointage 1 clic, annulation par re-clic, totaux du mois, mode de règlement) (le gros gain d'ergonomie) : grille où chaque
  colonne est un bail et chaque ligne un mois, avec un clic pour cocher "payé" —
  remplace le pointage bail par bail actuel. Le backend (upsert par bail+periode)
  existe déjà.
- [x] 🖥️ **Mode de règlement au pointage** (v1.5.0) : virement / chèque / espèces — la colonne
  `mode_paiement` existe déjà en BDD, seule l'interface manque.

### 4. Quittances

- [ ] 🖥️ **Profil bailleur incitatif** : bandeau d'onboarding au premier lancement si
  le profil est vide + badge dans la sidebar ; garder l'avertissement sur la page
  Quittances
- [x] 🗃️ **Historique des quittances générées** (v1.5.0, migration 0006, upsert par bail+période) : table `quittances` (bail, période,
  date, nom de fichier) — évite les doublons et les oublis, sert de preuve d'envoi
- [x] 🌐 **Envoi par email** LIVRÉ v1.7.0 : SMTP configurable dans Paramètres
  (hôte, port, STARTTLS/SSL, mot de passe d'application, nom d'expéditeur, bouton
  Tester), bouton « Envoyer par email au locataire » dans les Quittances, et si
  non configuré, invitation directe vers les Paramètres. L'app reste 100 %
  fonctionnelle sans internet.

### 5. Documents

- [x] 🖥️ **Documents rattachés au BIEN** (v1.5.0, fiche Bien) (diagnostics techniques, factures de travaux,
  taxe foncière, PNO) : la colonne `bien_id` existe déjà dans la table `documents` —
  ajouter l'UI de rattachement/consultation par bien, en plus des baux.

### 6. Statistiques patrimoniales

- [x] 🗃️ **Valeur vénale** (v1.5.0) saisie par bien (estimation, mise à jour datée) — socle des
  calculs de rentabilité
- [x] 🖥️ **Taux de vacance locative** (v1.6.0, fiche Bien) : % du temps où chaque bien est resté sans bail
  actif (calculable depuis les périodes entre baux)
- [x] 🖥️ **Rentabilité brute** (v1.5.0) = loyers annuels HC ÷ valeur vénale × 100 (par bien et
  global)
- [x] 🖥️ **Rentabilité nette & cash-flow** (v1.5.0, basée sur les dépenses de l'année) : nécessite le module Dépenses (ci-dessous) —
  (loyers − charges non récupérables − taxe foncière − frais/agence − assurance) ÷
  valeur vénale
- [x] 🖥️ **Gains dus aux révisions IRL** (v1.6.0, estimation annualisée) : suivi des € gagnés par an grâce aux
  révisions (historique `date_derniere_revision` + taux déjà en base)
- [x] 🗃️ **Récap revenus fonciers (2044)** LIVRÉ v1.6.0 : recettes/charges/résultat + comparaison micro-foncier vs réel et net imposable estimé : recettes vs charges
  déductibles par bien, prêt à reporter — s'appuie sur le module Dépenses

### 7. Modules transverses

- [x] 🗃️ **Module Dépenses / Frais** LIVRÉ v1.5.0 (le pilier de la partie patrimoniale) : table
  `depenses` (bien, catégorie : travaux/réparations/assurance PNO/taxe
  foncière/charges non récupérables, montant, date, justificatif) + page de saisie +
  alimentation des statistiques et du récap 2044
- [ ] 🗃️ **Régularisation annuelle des charges** : décompte par locataire (provisions
  versées vs charges réelles) avec génération d'un décompte PDF
- [ ] Journal d'activité : uniquement dans l'hypothèse multi-profils ci-dessus

### Reste à faire (au réveil de l'utilisateur)

- [ ] 🗃️ **DPE** : saisie faite via le formulaire — mais la valeur "vacants" du filtre et la régularisation annuelle des charges restent ouvertes
- [x] 🗃️ **Régularisation annuelle des charges** LIVRÉE v1.6.0 : saisie charges réelles par bail/année, écart à reverser/récupérer, décompte PDF conforme art. 23
- [x] 🖥️ **Taux de vacance locative** (v1.6.0, fiche Bien) + **gains dus aux révisions IRL** (statistiques patrimoniales fines)
- [ ] 🗃️ **Récap revenus fonciers (2044)** — recettes vs charges déductibles
- [ ] 🌐 Email quittances + multi-profils — exclus de cette passe

### Priorisation suggérée (par rapport valeur/effort)

1. **Matrice de pointage des paiements** (3) — le plus gros gain quotidien
2. **Module Dépenses + valeur vénale + rentabilité** (6+7) — ouvre toute la partie
   patrimoniale
3. **Trésorerie prévisionnelle + regroupement alertes** (1) — dashboard pro
4. **DPE, dépôt de garantie, type de charges, filtres** (2) — une seule migration
   groupée
5. **Fiche Bien / historique des locataires** (2) — refonte UI moyenne
6. **Documents par bien + historique quittances** (5+4) — backend en grande part prêt
7. Email quittances et multi-profils — seulement si besoin réel

## 🔜 V3.5 — Audit externe (25/10/2026) : triage et backlog

> Audit LLM indépendant (test réel UI + vérification base). Triage fait dans le code :
> la plupart des points sont réels, **deux affirmations sont fausses** (voir bas).

### ✅ Corrigé immédiatement (v1.8.0)
- **P1-1** Quittances en lot filtrées sur les loyers POINTÉS « payé » de la période
  (une quittance atteste un paiement intégral — art. 21) + compteur « en attente de pointage »
- **P1-6** Avertissement si l'adresse du logement est absente avant génération de quittance
- **P1-3** Alerte IRL à la DATE ANNIVERSAIRE du bail (art. 17-2) — plus de bruit permanent
- **P2-7** Dépenses : validation visible (« le montant doit être positif ») + bouton désactivé
- **P2-8** Paiements : KPI renommé « Reste à encaisser — dont X retard(s) à relancer »
- **P2-9** Espace manquant dans les groupes d'alertes corrigé
- **P2-10** aria-labels distincts sur les 3 boutons de pointage + bouton dépenses
- **P2-12** Détection de doublons de locataires (nom normalisé, confirmation)
- **P2-15** Fiscalité : biens meublés exclus du récap 2044 (BIC/LMNP) + note explicative
- **P2-16** Régularisation : écart « non saisi » distingué de zéro
- **P2-17** Tri stable de la matrice (bien puis locataire)

### ❌ Affirmations fausses de l'audit (vérifiées dans le code)
- « paiements sans clé primaire ni unicité » : **FAUX** — `PRIMARY KEY (bail_id, periode)`
  + `ON CONFLICT DO UPDATE`, testé anti-doublon dès l'étape BDD (et re-testé)
- « Sauvegarde sans checkpoint WAL » : **FAUX** — `wal_checkpoint(TRUNCATE)` avant copie

### 📋 À planifier (issues de l'audit, validées)
- [ ] 🗃️ **Table IRL embarquée** (hexagone/Corse/COM, trimestres 2005→) + choix du
  trimestre par liste + validation « même trimestre un an plus tard » + revalidation
  des valeurs importées (144,51→145,78 n'est pas une paire annuelle légale)
- [ ] 🖥️ **Reçu pour paiement partiel** (distinct de la quittance, art. 21)
- [ ] 🖥️ **Contrôle d'intégrité des données** (« Auditer mes données ») : adresses vides,
  doublons, IRL suspects, loyers annuels incohérents avec le mensuel — transforme les
  bugs de données importées en diagnostic
- [ ] 🗃️ **Recalcul/normalisation des loyers annuels importés** (une seule base :
  annuel = mensuel × 12, arrondi 2 décimales) + contrôle au chargement
- [ ] Trimestre de référence en liste déroulante (trimestre + année) au lieu du texte libre
- [ ] 🖥️ Compteurs cohérents « X biens loués + Y occupation gratuite » (surface/nombre)
- [ ] Formulaire Nouveau bail : footer d'action fixe (hauteur fenêtre)
- [ ] P3 : décimales sur « % du mois », slug ASCII des fichiers de quittance,
  recherche globale, chemin des données affiché + bouton « Ouvrir le dossier »

### 🔮 Vagues futures (issues de l'audit — nécessitent une décision produit)
- **Vague 2 « table stakes » concurrents** : bail pré-rempli généré (loi 1989), état des
  lieux numérique avec photos, relances d'impayés (J+1/J+10/mise en demeure), modèles de
  lettres, module Documents avancé, prélèvement SEPA / portail locataire, sync bancaire
- **Vague 3 « local souverain »** : chiffrement SQLCipher (écarté pour l'instant),
  sync chiffrée multi-PC, assistant IA local (Ollama), multi-bailleur/SCI, TRI/prévisionnel

---

## 🔮 V2 — pistes (démarré, non planifié)

- [x] **Statistiques enrichies** (v1.4.0 : graphiques recharts — encaissements 12 mois, camembert par type, comparaison annuelle ; 6 indicateurs dont taux d'occupation, charges, impayés. Reste possible : comparaison inter-annuelle fine, export des graphiques)
- [x] **Récupération automatique des indices IRL/ICC sur INSEE.fr** (v1.4.0 : bouton dans la fiche bail, séries BDM officielles 001515333/000008630, 8 derniers trimestres, saisie manuelle conservée hors ligne)
- [ ] Impôts : récap annuel (formulaire 2042 cases foncières, micro-foncier vs réel)
- [ ] **Multi-profils** — PISTE OUVERTE (non planifiée, à décider). Définition précise :
  plusieurs personnes utilisant le **même PC** et chacune gardant sa base séparée
  (écran de choix de profil au lancement, un fichier .db par profil). À distinguer :
  si un autre bailleur veut gérer SES lots, il installe simplement l'app sur son
  propre PC et a déjà sa base isolée — aucun développement nécessaire. Ne traiter
  que si un jour tu partages physiquement la machine
- [~] ~~Chiffrement de la base~~ — **abandonné** (décision 25/10/2026) : jugé inutile, l'app est personnelle et locale
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
