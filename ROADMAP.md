# Roadmap — GestyLoc

> Ce qui est livré, en bref : V1.0 → V1.9.2 — MVP complet (biens, locataires,
> baux, quittances PDF/impression/email, paiements, alertes), patrimoine
> (dépenses, rentabilité, 2044, régularisation des charges), IRL/ICC INSEE,
> statistiques recharts, matrice de pointage, fiche Bien/historique, documents
> par bien et par bail, DPE/dépôt de garantie, sauvegarde/restauration,
> import/export CSV, version portable, distribution automatique par GitHub
> Releases. Historique détaillé des livraisons : voir les releases GitHub et
> l'historique git.

## 🔜 À faire — priorisé

### ✅ Livré en v1.10.0 — « Statistiques 2.0 & Simulateur » (spec du 25/10/2026)
- **Segmentation par type** avec unités propres (€/m² logements, €/emplacement
  garages), médiane/Q1-Q3/min-max par segment, effectifs affichés, et
  « trop peu de biens » si n < 3 (principes R1/R2/R3 de la spec) — le KPI
  trompeur « loyer moyen / m² global » (6,37 €) a été supprimé
- **Liste des suspects** : biens > 15 % sous la médiane de leur segment, triés
  par manque à gagner annuel
- **Simulateur A — rattrapage IRL** : « et si j'avais révisé chaque année
  depuis X » avec IRL réelle INSEE (historique complet depuis 2004) ou taux
  fixe, arrondi au centime à chaque révision, garde-fou juridique affiché en
  grand (renonciation passée, pas une créance)
- **Seuil micro-BIC vs réel (LMNP)** : pour chaque bien meublé, charges
  déductibles vs seuil de bascule 50 % des recettes, avec note sur
  l'amortissement (hors périmètre : rend le réel encore plus favorable)
- Moteur de scénario **pur et testé** (`shared/stats.ts`) : 19 tests, dont
  identité à taux nul, monotonicité, arrondi légal, IRL manquant

### Correctifs techniques (issue de l'audit externe, causes racines traitées)
- [x] 🗃️ **Table IRL embarquée** (v1.11.0, en attente de publication) : 91
  trimestres INSEE (2004-T1 → 2026-T3) dans . L'outil de
  révision de la fiche bail est piloté par le trimestre : listes déroulantes
  pour la référence et le nouveau, valeurs auto, taux verrouillé, avertissement
  si la paire n'est pas annuelle. ⚠️ Les IRL importées (144,51 → 145,78)
  restent illégales : à corriger bail par bail (2 minutes chacune via l'outil).
- [ ] 🖥️ **Décompte « reçu » distinct de la quittance** pour paiements partiels
  (une quittance atteste un paiement intégral — art. 21, loi de 1989)
- [ ] 🗃️ **Table `baux_revisions`** (historique des révisions : date, ancien
  loyer, IRL ref/nouveau, taux) — prérequis pour comparer théorique vs réellement
  appliqué dans le simulateur (cf. spec « Statistiques 2.0 » §6, point le plus
  structurant)
- [ ] 🗃️ **Table `emprunts`** (capital, taux, échéance) — prérequis d'un
  cash-flow/TRI honnête si tu as des crédits (modèle C de la spec, à traiter
  seulement quand ce sera réel)
- [ ] 🖥️ **Modèle B complet de la spec** : clé de répartition de charges
  (surface/tantièmes), impact du passage provisionnel ↔ forfaitaire
- [ ] 🖥️ **Bouton « Auditer mes données »** : adresses vides, doublons de
  locataires, IRL suspects, loyers annuels incohérents — aucune concurrent ne
  l'a, diffrenciant
- [ ] 🖥️ Compteurs cohérents : « X biens loués + Y occupation gratuite »
  (surface et nombre actuellement sur des périmètres différents)
- [x] 🖥️ Formulaire Nouveau bail : footer d'actions fixe (P1-18)

### Finition (P3 de l'audit)
- [x] Décimales sur le « % du mois » du dashboard
- [x] Slug ASCII des noms de fichiers de quittance
- [ ] Recherche globale (retrouver un locataire depuis n'importe quelle page)
- [x] Afficher le chemin réel des données + bouton « Ouvrir le dossier »
- [x] « Marquer tout le mois payé » — reste : duplication d'un bail

### Dette technique
- [ ] Étendre les tests aux repositories et au service d'alertes. **Contrainte
  connue** : better-sqlite3 est compilé pour Electron, vitest tourne sur Node
  pur → incompatibilité (détail complet dans AGENTS.md §2). Voie identifiée :
  pilote libsql (pur JS) compatible vitest. Priorité quand le projet gagnera
  en complexité.

## 🔮 Pistes produit (nécessitent une décision, pas des bugs)

- **Bail pré-rempli généré** (nu/meublé, loi 1989) — tous les concurrents l'ont
- **Relances d'impayés** (J+1, J+10, mise en demeure — PDF + email)
- **État des lieux numérique** (photos + PDF) — gros chantier
- **Modèles de lettres** (congé, augmentation, EDL) — petit
- **Module Documents avancé** (partage, archivage)
- **Prélèvement SEPA / portail locataire / sync bancaire** — gros, oriente vers le SaaS
- **IA locale (Ollama)** pour lecture de factures / questions sur le parc —
  l'axe « local souverain », différenciant
- **Multi-bailleur / SCI**, sync chiffrée multi-PC, TRI/prévisionnel
- **Email** : rappels automatiques (nécessite la config SMTP, livrée)

## 💡 Idées récentes (issues des retours d'usage du 25/10/2026)

- [x] 🖥️ **Libellés de biens uniques** : fait via le helper `shared/labels.ts`
  (« Type · Désignation — Locataire » partout). Si tu veux un jour des noms
  courts encore plus parlants (« Studio Rdc »), il suffit de renommer la
  désignation du bien — le libellé suit automatiquement.
- [x] 🗃️ **Mise à jour automatique de la table IRL** : GitHub Action
  trimestriel `update-irl.yml` (16 jan/avr/juil/oct) qui recharge la série
  INSEE et commite `shared/irl-insee.ts` si elle a changé. À préciser : l'app
  utilise DEUX sources — la table embarquée (fiche bail, hors ligne) et
  l'interrogation live INSEE (simulateur).
- [ ] 🖥️ **Sauvegarde automatique périodique** (hebdo dans
  AppData/backups, rotation des 5 dernières) en plus de la sauvegarde manuelle
- [ ] 🖥️ **Notifications Windows au démarrage** pour les alertes urgentes
  (fin de bail < 30 j, loyer impayé) — la notif existe déjà pour les mises à jour
- [ ] 🖥️ **Décomptes de régularisation en lot** : générer d'un coup le décompte
  PDF de TOUS les baux régularisés (comme « Générer tout » des quittances —
  aujourd'hui il faut cliquer bail par bail dans la page Régularisation)
- [ ] 🖥️ **Export PDF du récap 2044** (mode « comptable » de l'audit)
## ❌ Abandonnés (décision 25/10/2026)

- **Chiffrement de la base** — jugé inutile pour l'usage actuel
- **Multi-profils sur un même PC** — piste ouverte, à traiter seulement si le
  PC est partagé (un autre bailleur = il installe l'app sur son propre PC)

---
*Dernière mise à jour : 25/10/2026 — version courante v1.9.2*
