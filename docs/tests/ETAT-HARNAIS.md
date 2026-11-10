# État du harnais de tests — GestyLoc

> **Mise à jour : 10/11/2026** (Finition P3, 5 commits locaux `main`) :
> **146 tests vitest + 42 tests BDD**, couverture shared/ ~95,8 % statements /
> 86,4 % branches / 98,6 % lignes, lint 0/0, `check_demo_30` 13 invariants,
> `npm run build` vert. Quatre modules purs ajoutés — voir la section
> « Ajouts 10/11/2026 » en bas de ce fichier.
>
> Mise à jour : 06/11/2026 (mission « étendre le harnais »). État de départ :
> 70 tests vitest + 8 tests BDD. État final : **118 tests vitest + 40 tests BDD**,
> couverture shared/ **98,31 % lignes / 85,62 % branches** (seuils 80/70/80),
> 4 commandes vertes : `npm test`, `npm run test:db`, `npm run typecheck`,
> `npm run lint` (0 erreur / 0 warning).

## Les deux harnais (ne pas mélanger)

| Harnais           | Runtime                                             | Portée                                                       | Base                                                                                                |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `npm test`        | Node pur (vitest)                                   | modules purs de `shared/` + `src/renderer/src/lib/format.ts` | aucune                                                                                              |
| `npm run test:db` | Electron (esbuild bundle `scripts/test-db/main.ts`) | repositories + services BDD (alertes, audit)                 | SQLite **temporaire** (`app.setPath('userData')` → tmpdir, supprimée à la fin — jamais `%APPDATA%`) |

La couverture (`npm run test:coverage`, provider v8) ne couvre que `shared/`
avec seuils bloquants (80 lignes / 70 branches / 80 fonctions / 80 statements).
Les modules de **types seuls** sont exclus, justifiés dans `vitest.config.ts` :
`types.ts`, `audit.ts` (la logique vit dans `audit.service.ts`, couverte par
le harnais BDD), `indices.ts` (la logique est réseau pur dans
`indices.service.ts` — non testable headless sans mocker, cf. trous).

## Tableau module → tests avant/après → couverture

| Module / Repository                    | Avant | Après     | Couverture                        | Fichier de test                        |
| -------------------------------------- | ----- | --------- | --------------------------------- | -------------------------------------- |
| shared/audit.ts (types seuls)          | 0     | 0 (types) | excl. justifiée                   | → audit.service via test:db            |
| shared/csv.ts                          | 15    | **20**    | 100 % lignes, 97,77 % br          | tests/csv.test.ts                      |
| shared/echeancier.ts                   | 25    | **31**    | 100 % lignes, 87,87 % br          | tests/echeancier.test.ts               |
| shared/indices.ts (types seuls)        | 0     | 0 (types) | excl. justifiée                   | — (service = réseau, trou)             |
| shared/irl-insee.ts                    | 0     | **9**     | 100 % tout                        | tests/irl-insee.test.ts                |
| shared/labels.ts                       | 0     | **6**     | 100 % tout                        | tests/labels.test.ts                   |
| shared/quittance-ref.ts                | 0     | **4**     | 100 % tout                        | tests/quittance-ref.test.ts            |
| shared/rapprochement.ts                | 16    | 16        | 96 % lignes, 79,13 % br           | tests/rapprochement.test.ts            |
| shared/relances.ts                     | 5     | 5         | 100 % lignes, 90 % br             | tests/relances.test.ts                 |
| shared/stats.ts                        | 9     | **12**    | 98,64 % lignes                    | tests/stats.test.ts                    |
| shared/types.ts (types seuls)          | —     | —         | excl. justifiée                   | —                                      |
| shared/updater-channels.ts             | 0     | **1**     | 100 % tout                        | tests/updater-channels.test.ts         |
| lib/format.ts (renderer)               | 0     | **9**     | pur, testé depuis son chemin réel | tests/format.test.ts                   |
| repositories/bail.repository           | (1)   | **2**     | —                                 | test-db/bail.test.ts                   |
| repositories/bien.repository           | 0     | **2**     | —                                 | test-db/bien.test.ts                   |
| repositories/locataire.repository      | 0     | **2**     | —                                 | test-db/locataire.test.ts              |
| repositories/paiement.repository       | (1)   | **3**     | —                                 | test-db/paiement.test.ts               |
| repositories/parametres.repository     | (1)   | **2**     | —                                 | test-db/parametres.test.ts             |
| repositories/bail-revision.repository  | (1)   | **1**     | —                                 | test-db/bail-revision.test.ts          |
| repositories/depense.repository        | 0     | **2**     | —                                 | test-db/depense.test.ts                |
| repositories/regularisation.repository | 0     | **2**     | —                                 | test-db/regularisation.test.ts         |
| services/alertes.service               | (4)   | **16**    | —                                 | test-db/alertes-impaye/irl, echeancier |
| services/audit.service                 | 0     | **8**     | —                                 | test-db/audit.test.ts                  |

**Totaux : vitest 70 → 118 ; BDD 8 → 40.** Tous les tests sont auto-contenus
(fixtures uniques par fichier) : aucun ne dépend de l'ordre d'exécution.

## Preuves de mutation (règle de qualité)

Chaque nouveau fichier a été prouvé en inversant la logique puis en
restaurant (`git checkout --` après chaque preuve) :

| Mutation appliquée                         | Fichier touché       | Échecs observés             | Restauré |
| ------------------------------------------ | -------------------- | --------------------------- | -------- |
| `valeurIrl` ?? 0 + tri non inversé         | shared/irl-insee.ts  | 2                           | 9/9      |
| round2 intermédiaire retiré (chaîne)       | shared/stats.ts      | 4 (dont la nouvelle chaîne) | 12/12    |
| condition `dejaPasse && !revise…` inversée | alertes.service.ts   | 2 précises                  | 19/19    |
| `joursOccupes` sans le jour d'entrée       | shared/echeancier.ts | 6                           | 31/31    |
| marge ignorée (`limite` sans marge)        | shared/echeancier.ts | 1 précise                   | 24/24    |
| `csvCell` sans échappement                 | shared/csv.ts        | 3 (round-trips)             | 20/20    |
| contrôle d'adresse désactivé               | audit.service.ts     | 1 précise                   | 32/32    |
| `bien.delete` neutralisé (cascade)         | bien.repository.ts   | 1 précise                   | 40/40    |
| `nomBien` → désignation seule              | shared/labels.ts     | 2                           | ✓        |
| `formatDate` → ISO brut                    | lib/format.ts        | 2                           | ✓        |

Un test révélé passant sous mutation ET sans mutation aurait été supprimé :
une assertion « ≠ calcul en une fois » sur la chaîne IRL s'est révélée
mathématiquement vaine (l'arrondi est absorbé sur ces valeurs) → supprimée,
la preuve étant déjà apportée par le round2 intermédiaire (4 échecs).

## Défauts suspectés / comportements documentés (NON corrigés)

1. **Trop-perçu non signalé** — `paiement.test.ts` : un paiement > attendu est
   enregistré tel quel avec le statut demandé, aucun statut « trop-perçu »
   n'existe dans le modèle (`StatutPaiement`). Produit à trancher.
2. **Sortie en cours de mois non proratisée** — `tests/echeancier.test.ts` :
   `montantAttendu` ignore `date_fin_bail` ; le mois de départ est dû entier.
   Choix de modélisation à trancher côté produit.
3. **« Paire IRL non annuelle » ne détecte jamais rien** — `audit.test.ts` :
   `paireLegale` (audit.service.ts) = (index T(n+1) connu) && (taux ≠ 0) —
   toujours vrai dès lors que taux ≠ 0. Le test fige le comportement actuel ;
   une correction le fera échouer (c'est voulu).
4. **Aucun historique de loyer par période** — l'attendu rétroactif des
   anciens mois utilise le loyer COURANT (constaté en écrivant les tests de
   chaîne de révision) ; la matrice de pointage d'un mois ancien compare donc
   au loyer d'aujourd'hui. À trancher côté produit.
5. **DÉFAUT DE FIXTURE (demo-30)** : la paire IRL de D15 saute une année
   (T3 2024 → T3 2026, réf. 144.51) — l'outil de révision de l'app n'accepte
   que des paires annuelles (T(n) → T(n+1)). À corriger dans les fixtures
   (réf. 145.77 = T3 2025) lors d'une prochaine passe ; documenté ici car
   découvert par le test de chaîne (les fixtures sont hors périmètre de
   cette mission, qui interdit de toucher au comportement).

## Trous restants (et pourquoi)

- **`indices.service.ts`** : fetch réseau INSEE (SDMX) — non testable
  headless sans mock (aucune dépendance de mock autorisée). Les types
  (`shared/indices.ts`) sont exclus de couverture (types seuls).
- **`documents.service.ts`** : `selectAndAttach`/`open` dépendent du dialog
  natif ; les fonctions BDD sont triviales (chemin en base). Couvert
  indirectement par les cascades du test bien.
- **Logique IRL du renderer** (BailDetail.tsx : calcul/annotation de la
  révision) — le renderer n'a pas de harnais (pas de React Testing Library
  ni jsdom dans le projet) ; la logique réversible est couverte par
  simulerRattrapageIrl et l'audit, la partie UI reste manuelle.
- **quittance.service / recu.service** (définitions PDF pdfmake) : la
  structure des gabarits n'est pas assertée (rendu PDF = validation visuelle).
- **Branches résiduelles** : csv.ts ligne 13 (BOM déjà absent), rapprochement
  113-118 (branches de détection d'en-têtes exotiques), stats.ts 210
  (retour nu du simulateur sur bail non simulable), echeancier 107-120
  (bornes extrêmes de joursDeRetard déjà partiellement couvertes).

## Hash des commits (chaque lot)

| Lot | Commit    | Contenu                                                                                                                 |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0   | `64d34d9` | @vitest/coverage-v8 + vitest.config.ts + `test:coverage` (seuils 80/70/80)                                              |
| 1   | `dd49df6` | priorité 1 : irl-insee (9), chaînes de révision, alertes IRL/assurance ; harnais BDD restructuré en fichiers par entité |
| 2   | `09d14d1` | priorité 2 : prorata bissextiles/bornes, sortie de mois documentée, joursDeRetard                                       |
| 3   | `7eabf09` | priorité 3 : alerte « non encaissé après jour de paiement », marge échéancier, trop-perçu                               |
| 4   | `76d2df8` | priorité 4 : round-trip CSV export↔import, audit.service (6 familles + défaut paireLegale)                              |
| 5   | `a9f087a` | priorité 5 : bien (cascade), locataire, dépense, régularisation                                                         |
| 6   | `a540f40` | priorité 6 : labels, quittance-ref, format fr-FR, canaux updater                                                        |

## Ajouts 10/11/2026 (Finition P3 — 118→**146** vitest, 40→**42** BDD)

| Module pur ajouté         | Tests  | Fichier                     | Usage                                                                                                     |
| ------------------------- | ------ | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `shared/sauvegarde.ts`    | **10** | tests/sauvegarde.test.ts    | nommage `auto_*.db`, rotation (5), échéance 7 j — consommé par `donnees.service.executerSauvegardeAuto()` |
| `shared/notifications.ts` | **4**  | tests/notifications.test.ts | résumé des alertes `urgent` (3 max + reste) — consommé par `index.ts`                                     |
| `shared/nom-fichier.ts`   | **7**  | tests/nom-fichier.test.ts   | slug sûr + `nomFichierDecompte` / `nomFichierRecap2044` — pages Regularisation et Statistiques            |
| `shared/fiscalite.ts`     | **6**  | tests/fiscalite.test.ts     | `calculerRecap2044` (seuil micro inclusif, ventilation par bail) — écran + PDF                            |

BDD ajouté : `scripts/test-db/sauvegarde.test.ts` (**2** — fichier créé +
rotation à 5 + paramètre persisté ; puis « pas de copie avant 7 jours »),
enregistré dans `scripts/test-db/main.ts` (section Services).

**Preuves de mutation du 10/11/2026** (logique inversée puis restaurée) :
`>= jours` → `(jours+1)` (1 échec) · filtre `severite === 'urgent'` → `!==`
(4 échecs) · `normalize('NFD')` retiré du slug (4 échecs) · seuil micro `<=`
→ `<` (1 échec). Aucune assertion ne passe à la fois sous mutation et sans.

**Incident d'outillage corrigé** : `electron-log` doit être `--external` du
bundle `test:db` (import transitif via `donnees.service`) ; `essais/**` est
exclu du lint (bundles esbuild de l'étude Best-of-N).
