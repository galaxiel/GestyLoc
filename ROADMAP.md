# Roadmap — GestyLoc

> **Version courante : v1.18.0** (15/11/2026). Tout ce qui est livré depuis
> V1.0 : MVP complet (biens, locataires, baux, quittances PDF/impression/email
> individuel et en groupe, paiements, alertes), patrimoine (dépenses,
> rentabilité, 2044, régularisation des charges avec décompte PDF), IRL/ICC
> INSEE embarquées + mise à jour automatique, statistiques segmentées +
> simulateur, matrice de pointage, fiches Bien/Bail avec historique, documents,
> DPE/dépôt de garantie, sauvegarde/restauration, import/export CSV, version
> portable (zip), distribution automatique GitHub Releases, références uniques
> QUITT sur les quittances, audit de données, reçu pour paiement partiel.
> Historique détaillé : voir les releases GitHub et l'historique git.
>
> **🔖 Session 10/11/2026 — Finition P3 (4 fonctionnalités), livrée en v1.18.0
> le 15/11/2026** :
> sauvegarde automatique hebdomadaire (rotation 5, `shared/sauvegarde.ts`),
> notification Windows des alertes urgentes au démarrage
> (`shared/notifications.ts`), décomptes de régularisation en lot
> (`shared/nom-fichier.ts`), export PDF du récap 2044 (`shared/fiscalite.ts`).
> 4 modules purs ajoutés (27 tests), harnais 146 vitest + 42 BDD, lint 0/0,
> démo 13 invariants. Commits `9f5cc6b`, `ecd4883`, `9c47673`, `1ac2535`.
>
> **🔖 Session 06-07/11/2026 — étude Best-of-N (document seul fusionné sur
> `main` le 15/11/2026, branche d'essais supprimée)** : contrat gelé + 8 tentatives indépendantes par sous-agents +
> jeu scellé de 2 000 cas + jugement par oracle. **Verdict : code actuel juste
> sur 2 485/2 500 cas** (0 unanimité KO) ; 15 divergences = uniquement des
> dates de début inexistantes (30/02, 31/06…) — ambiguïté de spec, à trancher
> côté produit. 6 « NON DÉTERMINÉ » listés dans `docs/tests/BEST-OF-N.md`.
> Détail : §Best-of-N de AGENTS.md.
>
> **🔖 Session 06/11/2026 (soir) — v1.17.0 et v1.17.1** : v1.17.0 = remise à
> zéro de l'application (Paramètres → Zone de danger, sauvegarde automatique
> avant effacement, double confirmation) ; v1.17.1 = harnais de tests étendu
> (118 vitest + 40 BDD, couverture shared/ 98,31 % lignes avec seuils
> bloquants, 10 preuves de mutation) — état complet : docs/tests/ETAT-HARNAIS.md.
>
> **🔖 Session 06/11/2026 — v1.16.1 (outillage uniquement, code de l'app inchangé)** :
> générateur déterministe de 30 dossiers locatifs synthétiques
> (`scripts/gen_demo_30.mjs`, seed 20261106), fixtures `fixtures/demo-30/`
> (baux.csv au format d'import, paiements.csv au format d'export, manifest),
> vérificateur `scripts/check_demo_30.mjs` (13 invariants sur base
> TEMPORAIRE — jamais la base réelle %APPDATA%), limites métier documentées
> dans fixtures/demo-30/README.md.
>
> **🔖 Session 04/11/2026 — compléments (même v1.16.0)** : avis d'échéance,
> relances d'impayés (3 niveaux + lettre PDF), contrat de location pré-rempli,
> traçage des demandes d'assurance (migration 0013), rapprochement v2 (règles
> mémorisées), comparatif théorique vs appliqué dans le simulateur, LINT VERT
> (0 erreur / 0 warning + lint en CI), harnais de tests BDD (8 tests
> repositories/alertes via Electron : `npm run test:db`). 70 tests vitest +
> 8 tests BDD au vert.
>
> **🔖 Session 03/11/2026 — livré en v1.16.0** : échéancier
> réel complet, rapprochement bancaire assisté, duplication de bail, recherche
> globale, reçu refondu, historique des révisions, durcissement sécurité du
> preload, + 10 bugs corrigés (audit externe). Publié en v1.16.0 le 04/11/2026
> (tag `v1.16.0`, rituel CONTRIBUTING).

## 🔜 À faire — priorisé

### Chantier « 💰 Échéancier réel » (besoin remonté par le bailleur, 26/10/2026)

> Situation réelle : les locataires paient **au début du mois** (jusqu'au 5-6,
> quand les aides sociales tombent), et à l'**entrée dans les lieux** ils
> paient un **prorata** jusqu'à la fin du mois en cours. GestyLoc suppose
> aujourd'hui implicitement « période = mois calendaire, début du bail = début
> de période ». Pour coller à la réalité :

- [x] 🖥️ **Champ « jour de paiement » sur le bail** (ex : 5) — par défaut 1 ;
      sert de référence au pointage et aux alertes de retard (retard si non payé
      au jour de paiement + marge configurable) — _migration 0011, champ dans le
      formulaire, marge réglable dans Paramètres (clé `echeancier`)_
- [x] 🗃️ **Prorata à l'entrée** : au premier mois, montant attendu = loyer CC ×
      (jours restants du mois ÷ jours du mois) — le pointage du premier mois
      accepte ce montant réduit sans crier « partiel » — _`shared/echeancier.ts`
      (12 tests), appliqué dans Paiements (totaux, pointage, partiel, « tout
      marquer payé »), badge « prorata 16/30 j » dans la matrice_
- [x] 🖥️ **Calendrier des échéances** : pour chaque bail, quand le loyer est dû
      et si le mois courant est à jour — _section « Échéances de loyer » du
      Dashboard, triée par jour de paiement, état Payé/Partiel/À pointer/En retard_
- [x] 🖥️ **Fiche bail** : afficher « Paiement le 5 de chaque mois » à côté des
      dates du bail
- 📝 **Tranché à l'implémentation** : prorata en **jours civils** (jour
  d'entrée compté comme occupé) — la méthode dixièmes reste possible en
  changeant uniquement `joursOccupes()`. La marge de retard est **tolérante**
  (configurable, 0 j par défaut) : l'alerte ne part qu'après échéance + marge.

### Correctifs techniques (reste de l'audit externe)

- [x] 🖥️ **Décompte « reçu » distinct de la quittance** en PDF autonome pour
      paiements partiels — _refonte : profil bailleur structuré (rue/CP/ville),
      adresse du locataire (migration 0009), « Fait à » prérempli, montant attendu
      proratisé, formulation non genrée_
- [x] 🗃️ **Table `baux_revisions`** (historique des révisions : date, ancien
      loyer, IRL ref/nouveau, taux) — _migration 0012, trace créée à chaque
      application de révision IRL, historique affiché dans la fiche bail_
- [ ] 🗃️ **Table `emprunts`** (capital, taux, échéance) — prérequis d'un
      cash-flow/TRI honnête (seulement si tu as des crédits)
- [ ] 🖥️ **Modèle B de la spec** : clé de répartition de charges
      (surface/tantièmes), impact du passage provisionnel ↔ forfaitaire
- [x] 🖥️ Compteurs cohérents : « X biens loués + Y occupation gratuite » —
      _Dashboard : biens gérés = biens DISTINCTS à bail actif (les anciens baux
      inactifs ne gonflent plus le total) ; loués + gratuits = total_

### Rapprochement bancaire assisté (décision 26/10/2026 : voie simple)

> Contexte : la connexion bancaire automatique (DSP2) exige un agrégateur
> (Powens, Bridge — plusieurs centaines d'€/mois) ou un agrément AISP — le
> mauvais combat pour l'instant. La voie pragmatique donne 90 % du bénéfice :

- [x] 🖥️ **Import de relevé bancaire CSV** — _section « Rapprochement
      bancaire » de la page Paiements ; détection automatique du séparateur
      (Excel-fr `;` / `,`) et des colonnes date/libellé/montant, heuristique
      sans en-tête ; lecture 100 % locale (FileReader, aucun fs côté renderer)_
- [x] 🖥️ **Matching automatique** : montant + période → proposition de
      pointage — _`shared/rapprochement.ts` (12 tests) : montant exact ± 1 ct
      contre le loyer attendu (prorata compris) du mois de l'opération / de la
      période pointée / de leurs mois précédents ; le nom du locataire dans le
      libellé départage ; ambigu = « à revoir », jamais d'attribution au hasard ;
      les périodes déjà payées ne sont jamais re-proposées_
- [x] 🖥️ **Validation en masse** des propositions reconnues — _cases pré-cochées
      pour les propositions sûres, bouton « Pointer la sélection » (statut payé,
      date = date de l'opération, référence = libellé bancaire, note
      « Rapprochement bancaire »)_

### Finition (P3 de l'audit)

- [x] Recherche globale — _champ de recherche dans la barre latérale
      (disponible depuis toutes les pages) : locataire, nom/désignation du bien,
      ville, adresse → fiche bail en 1 clic_
- [x] Duplication d'un bail — _bouton ⧉ dans le tableau : ouvre le formulaire
      de CRÉATION pré-rempli (dates vidées, IRL nouveau/taux non copiés,
      bail actif) — idéal pour une relocation_
- [x] **Sauvegarde automatique hebdomadaire** (rotation des 5 dernières) —
      _au démarrage, au plus une fois par 7 jours : copie dans
      `userData/backups/auto_*.db`, rotation à 5 (règles pures dans
      `shared/sauvegarde.ts`, 10 tests vitest + 2 BDD) ; date affichée dans
      Paramètres_
- [x] **Notifications Windows au démarrage** pour les alertes urgentes —
      _notification native résumant les alertes `urgent` (impayés, bail expiré),
      3 détaillées max puis « … et N autres » ; un clic ramène sur la fenêtre
      (`shared/notifications.ts`, 4 tests)_
- [x] **Décomptes de régularisation en lot** (un PDF par bail d'un coup) —
      _bouton « Générer tous les décomptes » : un PDF par bail dont les charges
      réelles sont saisies, dans un dossier choisi une fois, avec progression et
      comptage des erreurs (nommage pur `shared/nom-fichier.ts`, 7 tests)_
- [x] **Export PDF du récap 2044** (mode « comptable ») —
      _bouton dans Statistiques : totaux, ventilation des recettes par bail,
      comparatif micro-foncier vs réel et mentions ; calcul du récap extrait en
      module pur `shared/fiscalite.ts` (6 tests), partagé écran/PDF_

### 🏪 Microsoft Store (MSIX) — décision 15/11/2026

> Seule voie **gratuite** qui supprime l'avertissement SmartScreen : Microsoft
> héberge, **signe** et met à jour le paquet, donc plus de « Windows a protégé
> votre ordinateur ». La release GitHub (`setup.exe` NSIS) reste en parallèle et
> gardera l'avertissement (app non signée — cf. `AGENTS.md` §7).
> Procédure détaillée, phase par phase : **`docs/MICROSOFT-STORE.md`**.

- [ ] Compte développeur individuel (gratuit depuis le 10/09/2025) + réservation
      du nom « GestyLoc » ; récupérer `Identity/Name`, `Identity/Publisher` et
      `PublisherDisplayName` dans Partner Center
- [ ] Trancher l'identité d'éditeur affichée et publier l'URL de politique de
      confidentialité (100 % local, aucune collecte)
- [ ] Cible `msix` (repli `appx`) dans electron-builder, manifeste **full-trust**
      `mediumIL` — pas d'`appContainer`, la base doit rester dans
      `%APPDATA%\gestyloc`
- [ ] Couper `electron-updater` et le mode portable dans le build Store (c'est le
      Store qui met à jour, le dossier d'installation est en lecture seule)
- [ ] Vérifier `better-sqlite3` et un parcours complet sur une installation MSIX
      réelle, sur une **copie** de la base (jamais `%APPDATA%` du bailleur)
- [ ] Soumission Partner Center : captures ≥ 1366×768, questionnaire IARC, notes
      de certification (application utilisable sans données réelles)

### Dette technique

- [x] Étendre les tests : 19 → 61 (échéancier, rapprochement, CSV Excel-fr/BOM,
      dates fantômes, stats segments) — _les repositories et le service d'alertes
      restent à couvrir_
- [x] Étendre les tests aux repositories et au service d'alertes — _harnais
      Electron `npm run test:db` (scripts/test-db/) : base temporaire, migrations
      réelles, 8 assertions (FK factice ignorée en UPDATE, reference/notes d'upsert,
      révisions, paramètres, alertes retard/impayé/occupation-gratuite, marge
      échéancier). La voie libsql reste ouverte pour intégrer ça à vitest un jour._
- [x] **Lint** : 0 erreur / 0 warning — les 43 erreurs corrigées (dont un vrai
      bug latent : hook useState après return conditionnel dans BailDetail ;
      impureté de rendu dans BienDetail), `.gitattributes` (eol=lf) + prettier
      `endOfLine: auto` (fin des 10 k warnings CRLF), et `npm run lint` est passé
      dans la CI de release (bloque une release sale).

## 🔮 Pistes produit (nécessitent une décision, pas des bugs)

- [x] **Bail pré-rempli généré** (nu/meublé, loi 1989) — _bouton « Contrat » de
      la fiche bail : parties, désignation, durée légale, loyer + jour de paiement,
      dépôt, IRL, annexes, signatures — modèle indicatif à relire_
- [x] **Relances d'impayés** (courtoise / ferme / mise en demeure — email
      prérempli + copie + lettre PDF) — _bouton ✉ sur les lignes retard/impayé de
      Paiements, 3 templates testés dans `shared/relances.ts`, jamais d'envoi
      automatique_
- [x] **Avis d'échéance** : document distinct de la quittance (rappel du loyer à
      venir AVANT paiement, même référence QUITT) — _bouton dans la page Quittances
      pour le mois suivant, échéancier réel intégré (prorata + jour de paiement)_
- **État des lieux numérique** (photos + PDF) — gros chantier
- **Modèles de lettres** (congé, augmentation, EDL) — petit
- **Prélèvement SEPA / portail locataire / sync bancaire** — gros, oriente vers
  le SaaS
- **IA locale (Ollama)** pour lecture de factures / questions sur le parc —
  l'axe « local souverain », différenciant
- [x] **Assurances : traçage des demandes envoyées** — _migration 0013
      (baux.assurance_demandee_le), tracée à chaque envoi de l'email d'assurance,
      affichée sur la fiche bail ; l'alerte anniversaire ne repart pas si la
      demande a moins de 11 mois_
- **Signature de code (SmartScreen)** — _tranché le 15/11/2026 : pas de certificat
  acheté (OV/EV ne supprime plus l'alerte depuis 2024 et exige un token matériel ;
  Azure Artifact Signing fermé aux particuliers hors USA/Canada ; SignPath gratuit
  exige une licence OSI, incompatible avec PolyForm). La voie retenue est le
  chantier **Microsoft Store (MSIX)** ci-dessus ; la release GitHub garde
  l'avertissement, contourné par « Informations complémentaires → Exécuter
  quand même »._
- **Multi-bailleur / SCI**, sync chiffrée multi-PC, TRI/prévisionnel
- **Rappels automatiques** (nécessite la config SMTP, livrée)
- **Version anglaise** : react-i18next + ~300 chaînes + PDF bilingues,
  1-2 sessions — voir l'analyse complète plus bas

## 🌐 Internationalisation (anglais)

Faisabilité : **simple mais non trivial**. Le bon outil est `react-i18next` :

- Toutes les chaînes de l'UI (~300 aujourd'hui) passent dans `t('clé')`
- Un fichier `locales/fr.json` + `locales/en.json`
- Détection de la langue de l'OS, sélecteur dans Paramètres
- Les PDF (quittance, régularisation) ont leur gabarit bilingue à part
- Effort estimé : 1 à 2 sessions complètes. Recommandé seulement si une
  demande réelle existe (toi ou des utilisateurs anglophones).

## 🐛 Signaler un bug (comment faire)

Rapport via les [Issues GitHub](https://github.com/galaxiel/GestyLoc/issues) :

1. **Titre** : une phrase claire (« La page X affiche Y au lieu de Z »)
2. **Étapes pour reproduire** : exactement ce que tu as cliqué, dans l'ordre
3. **Attendu vs obtenu**
4. **Version** : affichée dans la barre latérale (ex : v1.18.0)
5. **Pièce jointe utile** : le fichier `logs/main.log`
   (%APPDATA%\gestyloc\logs\main.log) — il contient les migrations, les
   erreurs de mise à jour et les exceptions.
   ⚠️ **N'inclus jamais app.db** (données personnelles des locataires) ni une
   capture d'écran avec des noms de locataires visibles — masque-les.
6. Les rapports avec le message exact du pare-chocs d'erreurs (capture ou
   copie) sont diagnostiqués quasi immédiatement — cf. le bug Quittances
   résolu ainsi.

## 📄 Licence — PolyForm Noncommercial (décision 25/10/2026)

Le code reste visible et utilisable gratuitement par tout particulier pour
ses propres locations, mais **aucune exploitation commerciale** n'est autorisée
sans accord écrit — ce qui réserve l'usage commercial au projet de SAS de
l'auteur. Si le jour venu tu veux libérer certaines parties (ou tout) : il
suffira de re-mettre à jour LICENSE.

## ❌ Abandonnés

- **Automatisation Google Apps Script des quittances** (abandonnée le
  15/11/2026) — une automatisation cloud dans un logiciel 100 % hors ligne, qui
  demandait soit un export CSV manuel de l'app, soit un tiers poussant les lignes
  depuis `app.db` ; et le besoin est de toute façon couvert par les relances, les
  avis d'échéance et les quittances en lot livrés depuis la v1.16.0
- **Chiffrement de la base** — jugé inutile pour l'usage actuel
- **Multi-profils sur un même PC** — piste ouverte, à traiter seulement si le
  PC est partagé (un autre bailleur = il installe l'app sur son propre PC)

---

_Dernière mise à jour : 15/11/2026 — nettoyage de la documentation (en-tête de
version, journal remis dans l'ordre, Google Apps Script abandonné, Best-of-N
ramené sur `main`) — dernière version publiée : **v1.18.0** (Finition P3 :
sauvegarde auto hebdo, notifications Windows, décomptes en lot, export PDF 2044)._
