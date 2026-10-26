# Roadmap — GestyLoc

> **Version courante : v1.15.0** (26/10/2026). Tout ce qui est livré depuis
> V1.0 : MVP complet (biens, locataires, baux, quittances PDF/impression/email
> individuel et en groupe, paiements, alertes), patrimoine (dépenses,
> rentabilité, 2044, régularisation des charges avec décompte PDF), IRL/ICC
> INSEE embarquées + mise à jour automatique, statistiques segmentées +
> simulateur, matrice de pointage, fiches Bien/Bail avec historique, documents,
> DPE/dépôt de garantie, sauvegarde/restauration, import/export CSV, version
> portable (zip), distribution automatique GitHub Releases, références uniques
> QUITT sur les quittances, audit de données, reçu pour paiement partiel.
> Historique détaillé : voir les releases GitHub et l'historique git.

## 🔜 À faire — priorisé

### Chantier « 💰 Échéancier réel » (besoin remonté par le bailleur, 26/10/2026)

> Situation réelle : les locataires paient **au début du mois** (jusqu'au 5-6,
> quand les aides sociales tombent), et à l'**entrée dans les lieux** ils
> paient un **prorata** jusqu'à la fin du mois en cours. GestyLoc suppose
> aujourd'hui implicitement « période = mois calendaire, début du bail = début
> de période ». Pour coller à la réalité :

- [ ] 🖥️ **Champ « jour de paiement » sur le bail** (ex : 5) — par défaut 1 ;
  sert de référence au pointage et aux alertes de retard (retard si non payé
  au jour de paiement + marge configurable)
- [ ] 🗃️ **Prorata à l'entrée** : au premier mois, montant attendu = loyer CC ×
  (jours restants du mois ÷ jours du mois) — le pointage du premier mois
  accepte ce montant réduit sans crier « partiel »
- [ ] 🖥️ **Calendrier des échéances** : pour chaque bail, quand le loyer est dû
  et si le mois courant est à jour
- [ ] 🖥️ **Fiche bail** : afficher « Paiement le 5 de chaque mois » à côté des
  dates du bail
- 📝 À trancher au moment de l'implémentation : prorata en jours civils ou en
  dixièmes (méthode courtier) ? Le jour de paiement est-il décalé par les aides
  ou juste tolérant ?

### Correctifs techniques (reste de l'audit externe)

- [ ] 🖥️ **Décompte « reçu » distinct de la quittance** en PDF autonome pour
  paiements partiels (le reçu est aujourd'hui généré au pointage 💶 mais sans
  les adresses complètes refondues de la v1.15)
- [ ] 🗃️ **Table `baux_revisions`** (historique des révisions : date, ancien
  loyer, IRL ref/nouveau, taux) — prérequis pour comparer théorique vs
  réellement appliqué dans le simulateur
- [ ] 🗃️ **Table `emprunts`** (capital, taux, échéance) — prérequis d'un
  cash-flow/TRI honnête (seulement si tu as des crédits)
- [ ] 🖥️ **Modèle B de la spec** : clé de répartition de charges
  (surface/tantièmes), impact du passage provisionnel ↔ forfaitaire
- [ ] 🖥️ Compteurs cohérents : « X biens loués + Y occupation gratuite »

### Finition (P3 de l'audit)

- [ ] Recherche globale (retrouver un locataire depuis n'importe quelle page)
- [ ] Duplication d'un bail
- [ ] Sauvegarde automatique hebdomadaire (rotation des 5 dernières)
- [ ] Notifications Windows au démarrage pour les alertes urgentes
- [ ] Décomptes de régularisation en lot (un PDF par bail d'un coup)
- [ ] Export PDF du récap 2044 (mode « comptable »)

### Dette technique

- [ ] Étendre les tests aux repositories et au service d'alertes. **Contrainte
  connue** : better-sqlite3 est compilé pour Electron, vitest tourne sur Node
  pur → incompatibilité (détail dans AGENTS.md §2). Voie identifiée : pilote
  libsql (pur JS). Priorité quand le projet gagnera en complexité.

## 🔮 Pistes produit (nécessitent une décision, pas des bugs)

- **Bail pré-rempli généré** (nu/meublé, loi 1989) — tous les concurrents l'ont
- **Relances d'impayés** (J+1, J+10, mise en demeure — PDF + email)
- **Avis d'échéance** : document distinct de la quittance (rappel du loyer à
  venir AVANT paiement, même référence QUITT) — souhait de l'UIA
- **État des lieux numérique** (photos + PDF) — gros chantier
- **Modèles de lettres** (congé, augmentation, EDL) — petit
- **Prélèvement SEPA / portail locataire / sync bancaire** — gros, oriente vers
  le SaaS
- **IA locale (Ollama)** pour lecture de factures / questions sur le parc —
  l'axe « local souverain », différenciant
- **Assurances : traçage des demandes envoyées** (l'email prérempli est livré
  v1.15 ; reste à enregistrer la date de dernière demande pour ne pas relancer)
- **Signature de code (SmartScreen)** : les installs affichent « Windows a
  protégé votre ordinateur » (app non signée). Contournement immédiat :
  « Informations complémentaires → Exécuter quand même ». Solutions : Azure
  Trusted Signing (~10 €/mois), certificat OV (~100-250 €/an), EV (~300-500
  €/an). À intégrer au workflow le jour de la diffusion publique (SAS)
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
4. **Version** : affichée dans la barre latérale (ex : v1.15.0)
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

## ❌ Abandonnés (décision 25/10/2026)

- **Chiffrement de la base** — jugé inutile pour l'usage actuel
- **Multi-profils sur un même PC** — piste ouverte, à traiter seulement si le
  PC est partagé (un autre bailleur = il installe l'app sur son propre PC)

---
*Dernière mise à jour : 26/10/2026 — version courante v1.15.0*
