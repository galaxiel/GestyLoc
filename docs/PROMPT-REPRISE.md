# PROMPT DE REPRISE — GestyLoc (pour tout agent)

> Copie-colle le bloc ci-dessous au début d'une nouvelle session.
> Il est conçu pour être exhaustif mais économe en contexte : tout le détail
> est dans les fichiers pointés, le prompt ne charge que les entrées.

---

```text
Projet : GestyLoc (galaxiel/GestyLoc) — gestion locative Electron 40 + React 19
+ TS + better-sqlite3/Drizzle, 100 % local. Clone de travail :
D:\Bureau\projet gestion locative\gestion-locative (branche main = v1.17.1
publiée). Utilisateur : galaxiel, français, Windows 11, propriétaire de 16
baux RÉELS — ne JAMAIS toucher à %APPDATA%\gestyloc\data\app.db.

1. LIS D'ABORD (dans cet ordre, ~15 min de contexte) :
   - AGENTS.md §1-§8 : état, stack fragile (better-sqlite3 = Electron uniquement,
     lint 0/0 exigé, conventions IPC, migrations 0001→0013), chantiers livrés,
     pièges runtime. Ne refais rien de coché dans ROADMAP.md.
   - ROADMAP.md : journal des sessions 03/11 → 07/11 et sections À faire /
     Pistes produit / Abandonnés.
   - docs/tests/ETAT-HARNAIS.md : harnais (118 vitest + 40 BDD via
     `npm run test:db` sous Electron, couverture shared/ 98,31 % lignes,
     10 preuves de mutation, 5 défauts/comportements documentés NON corrigés).
   - docs/tests/BEST-OF-N.md (branche essais/best-of-n) : étude Best-of-N
     révision IRL + prorata — verdict : code actuel juste (2 485/2 500 cas en
     unanimité 9 colonnes + oracle) ; 15 divergences = dates inexistantes
     (ambiguïté de spec) ; 6 « NON DÉTERMINÉ » à trancher côté produit.

2. ÉTAT DES BRANCHES :
   - main = v1.17.1 (tout poussé, working tree propre).
   - essais/best-of-n = étude Best-of-N (5 commits, poussée, NON fusionnée —
     fusion à la décision du propriétaire ; aucun code d'app dedans).

3. COMMANDES DE VALIDATION (toutes obligatoires avant commit) :
   npm run typecheck && npm run lint (0/0) && npm test (118) &&
   npm run test:db (40, base temporaire). Couverture : npm run test:coverage.
   Démo : node scripts/check_demo_30.mjs (13 invariants, base temporaire).

4. RÈGLES NON NÉGOCIABLES :
   - Release : JAMAIS taguer/publier sans ordre explicite du propriétaire.
     Rituel CONTRIBUTING (lint+test+test:db verts avant le tag, 4 assets
     exactement, préserver le bloc « ### Empreintes SHA-256 » des notes,
     pousser le tag explicitement). Empreintes = seule preuve d'intégrité
     (app non signée — décision fermée).
   - FK jamais dans un UPDATE ; window.prompt inexistant ; renderer sans
     Node/fs (window.api uniquement) ; toute modif schéma = NOUVELLE
     migration ; better-sqlite3 ne charge que dans Electron (harnais BDD
     sous Electron, vitest sur Node pur — ne jamais mélanger).

5. SUJETS OUVERTS (dans l'ordre de valeur) :
   a. Retour utilisateur sur v1.17.x : remise à zéro + import
      fixtures/demo-30/baux.csv, puis ses 16 baux réels (prorata 1er mois,
      rapprochement avec un vrai relevé).
   b. Trancher les 6 « NON DÉTERMINÉ » du Best-of-N (docs/tests/BEST-OF-N.md
      §5, sur la branche essais/best-of-n) — dont rejet vs rollover des dates
      d'import inexistantes et prorata de sortie.
   c. Corriger la paire IRL de la fixture D15 (T3 2024→T3 2026 illégale —
      réf. devrait être T3 2025 = 145.77), régénérer fixtures + check_demo.
   d. ROADMAP « À faire » : IRL des 16 baux réels, sauvegarde auto hebdo,
      notifications Windows, décomptes en lot, export 2044 PDF.
   e. Pistes produit (décision propriétaire) : bail pré-rempli... déjà fait ;
      restent état des lieux, SEPA, i18n, signature (MSIX avant certificat).

6. MÉTHODE DE TRAVAIL ATTENDUE :
   - Un lot = un module ; les 4 commandes de validation après chaque lot ;
     commit conventionnel ; ne pas pousser/taguer sans ordre.
   - Économie de contexte : lire par tranches utiles (grep + Read offset),
     ne jamais recopier un fichier entier dans le chat, regrouper les
     commandes (&&), filtrer les sorties à la source.
   - Les agents sous-limite de concurrence : 2 simultanés max (lancer en
     vagues sérielles).
```
