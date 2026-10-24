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

- [ ] **Import du tableur Excel existant** (CSV → BDD) :
  - [ ] Script de mapping colonnes tableur → tables `biens` / `locataires` / `baux`
  - [ ] Interface d'import (sélection fichier, aperçu, validation, rapport d'erreurs)
  - [ ] Détection des doublons à l'import
- [x] Profil **bailleur** (nom, adresse) dans Paramètres → pré-rempli dans les quittances (avertissement si vide)
- [x] Page **Documents** : interface React — sélection bail, ajout (dialog OS), ouverture, suppression

## 🔜 V1.2 — Confort d'usage

- [ ] Fiche détaillée d'un bail (vue complète : historique paiements, documents, IRL)
- [ ] Calcul automatique de la révision IRL (formulaire guidé : IRL ref → nouveau loyer)
- [ ] Génération de quittances **en lot** (un mois → tous les baux actifs)
- [ ] Export des données (CSV/Excel) pour sauvegarde externe
- [ ] Sauvegarde/restauration de la base (copie datée dans AppData)
- [ ] Raccourcis clavier (navigation, nouveau bail)

## 🔮 V2 — pistes (non planifié)

- [ ] Statistiques avancées (graphiques : évolution des loyers, taux d'occupation, charges)
- [ ] Impôts : récap annuel (formulaire 2042 cases foncières, micro-foncier vs réel)
- [ ] Multi-profils / multi-bailleurs
- [ ] Chiffrement de la base (mot de passe au lancement)
- [x] Statut **occupation gratuite** sur un bail (ex : logement familial) : badge, exclus des loyers/quittances/alertes/paiements
- [x] Statut **occupation gratuite** sur un bail (ex : logement familial) : badge dans le tableau, exclus des loyers attendus, quittances, alertes IRL et pointage
- [x] Quittances : bouton **Imprimer** (dialogue d'impression système) en plus de l'export PDF
- [ ] Rappels par email (optionnel, nécessite connexion)
- [ ] Version portable (.exe sans installation)

---

## Bugs connus / dettes techniques

- [x] Montant « Encaissé ce mois » branché sur les paiements pointés (payé/partiel) de la période courante
- [ ] Quittance : champs bailleur à compléter (dépend du profil bailleur V1.1)
- [ ] Ajouter des tests automatisés (repositories + services d'alertes)
- [ ] Icône d'app à personnaliser (actuellement l'icône template electron-vite dans `build/` et `resources/`)
