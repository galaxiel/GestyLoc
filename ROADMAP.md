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

### Correctifs techniques (issue de l'audit externe, causes racines traitées)
- [ ] 🗃️ **Table IRL embarquée** (hexagone/Corse/COM, trimestres 2005→) :
  choix du trimestre par liste dans la révision, validation « même trimestre un
  an plus tard », et revalidation des valeurs importées. ⚠️ Les IRL actuelles
  (144,51 → 145,78) ne forment pas une paire annuelle légale — à corriger bail
  par bail via le bouton INSEE.
- [ ] 🖥️ **Décompte « reçu » distinct de la quittance** pour paiements partiels
  (une quittance atteste un paiement intégral — art. 21, loi de 1989)
- [ ] 🖥️ **Bouton « Auditer mes données »** : adresses vides, doublons de
  locataires, IRL suspects, loyers annuels incohérents — aucune concurrent ne
  l'a, diffrenciant
- [ ] 🖥️ Compteurs cohérents : « X biens loués + Y occupation gratuite »
  (surface et nombre actuellement sur des périmètres différents)
- [ ] 🖥️ Formulaire Nouveau bail : footer d'actions fixe (bouton coupé sur les
  petits écrans, signalement P1-18 de l'audit)

### Finition (P3 de l'audit)
- [ ] Décimales sur le « % du mois » du dashboard
- [ ] Slug ASCII des noms de fichiers de quittance (les virgules/accents des
  noms passent mal en pièce jointe)
- [ ] Recherche globale (retrouver un locataire depuis n'importe quelle page)
- [ ] Afficher le chemin réel des données + bouton « Ouvrir le dossier »
- [ ] « Marquer tout le mois payé », duplication d'un bail

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

## ❌ Abandonnés (décision 25/10/2026)

- **Chiffrement de la base** — jugé inutile pour l'usage actuel
- **Multi-profils sur un même PC** — piste ouverte, à traiter seulement si le
  PC est partagé (un autre bailleur = il installe l'app sur son propre PC)

---
*Dernière mise à jour : 25/10/2026 — version courante v1.9.2*
