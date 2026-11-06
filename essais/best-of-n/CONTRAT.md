# CONTRAT — Best-of-N Révision IRL & Prorata (GestyLoc)

> Gelé le 06/11/2026 (commit de la phase 0, branche `essais/best-of-n`).
> Ce contrat est la SEULE référence pour juger les implémentations. Aucune
> modification après le gel de la phase 1. Toute divergence est tranchée par
> une règle citée ici, jamais par un vote.

## 1. Signatures exactes (telles qu'elles existent aujourd'hui)

### 1a. Révision IRL — `shared/stats.ts` (l. 137-220)

```ts
export interface BailPourSimulation {
  bailId: number
  designation: string
  locataire: string
  loyerHcActuel: number
  dateDebutBail: string // 'yyyy-mm-dd'
  trimestreRef: string | null // 'T3 2023'
}

export interface ResultatSimulationBail {
  bailId: number
  designation: string
  locataire: string
  loyerActuel: number
  loyerSimule: number
  deltaMois: number
  deltaAn: number
  revisionsJouees: number
}

export function simulerRattrapageIrl(
  baux: BailPourSimulation[],
  anneeDepart: number,
  irlParTrimestre: Map<string, number> | null, // clé '2024-Q3'
  tauxFixeAnnuel: number | null // en %, ex 1.5 — utilisé si la map est null
): ResultatSimulationBail[]
```

Fichier attendu de chaque tentative : `impl-revision.ts` exportant ces deux
interfaces et cette fonction, avec ces noms exacts.

### 1b. Prorata — `shared/echeancier.ts` (l. 60-95)

```ts
export interface BailEcheancier {
  date_debut_bail: string | null
  date_fin_bail?: string | null // ⚠ SONDE : champ absent du code actuel,
  //                               ajouté au contrat pour étudier la sortie.
  loyer_cc: number | null
  loyer_hc: number | null
  charges: number | null
}

export function montantAttendu(bail: BailEcheancier, periode: string): number | null
```

Fichier attendu : `impl-prorata.ts` exportant l'interface et la fonction.

### Sérialisation des cas

Les cas sont fournis en JSON ; `irlParTrimestre` y figure en **objet**
`{"2024-Q3": 144.51}` — le couloir d'exécution le convertit en `Map` avant
l'appel. Toute tentative reçoit donc bien une `Map` (fidèle au code actuel).

## 2. Règles métier — chacune avec sa source

### Révision IRL

| # | Règle | Source |
|---|---|---|
| R1 | Le loyer est révisé une fois par an, à la date anniversaire du bail (même mois/jour que la date de début). | Loi n° 89-462 du 06/07/1989, **art. 17-2** (mentionnée dans README/AGENTS/BailDetail.tsx du dépôt). |
| R2 | L'indice appliqué est l'**indice de référence des loyers (IRL) publié par l'INSEE** du trimestre de référence du bail : ratio = IRL(T(n), année y) / IRL(T(n), année y−1). | Code `shared/stats.ts` l. 197-200 ; art. 17-2 pour le principe de l'indice de référence INSEE. |
| R3 | Le trimestre d'indexation est celui du **trimestre de référence** du bail ; à défaut, le trimestre de la date de début. Parsing ANCRÉ : `/\bT([1-4])\b/`. | Code `shared/stats.ts` l. 183-186 (fix du 03/11 : « T3 2023 » → 3). |
| R4 | Le loyer révisé est **arrondi au centime à chaque révision** jouée. | Code `shared/stats.ts` l. 205 (« arrondi au centime, obligatoire »). ⚠️ La loi ne fixe pas la précision d'arrondi : règle du CODE, légèrement + protectrice que la pratique usuelle. |
| R5 | Les révisions sont rejouées de `anneeDepart` à l'année **courante** (borne système, cf. §4) ; les anniversaires antérieurs ou égaux à la date de début sont sautés (1ʳᵉ année) ; les anniversaires FUTURS sont sautés (non encore dus). | Code `shared/stats.ts` l. 192-195. |
| R6 | Si un indice manque (précédent ou courant) ou si l'indice précédent ≤ 0, la révision de cette année est **sautée** (pas de ratio). | Code `shared/stats.ts` l. 197-203. |
| R7 | Si `irlParTrimestre` est null et `tauxFixeAnnuel` non null : ratio = 1 + taux/100 chaque année. | Code `shared/stats.ts` l. 201-202. |
| R8 | Si `loyerHcActuel` ≤ 0 ou date de début illisible : résultat à l'identique, 0 révision. | Code `shared/stats.ts` l. 170-182. |
| R9 | Anniversaire 29 février : borné au 28/02 les années non bissextiles. | Code `shared/stats.ts` (bornes `Math.min(debut.getDate(), dernierJour)`). |
| R10 | **NON DÉTERMINÉ** : la borne temporelle (« aujourd'hui ») n'est PAS injectable dans la signature actuelle. Pour l'étude, elle est gelée au **06/11/2026** (§4). | Constat de structure (l'appel `new Date()` interne). |
| R11 | **NON DÉTERMINÉ** : la règle en cas de changement de trimestre de référence en cours de bail ; le code suppose un trimestre fixe. | Absent du code. |
| R12 | **NON DÉTERMINÉ** : ce que fait le bailleur qui a sauté une ou plusieurs années puis reprend (le simulateur rejoue année par année avec les indices manquants → révisions sautées ; une paire sur 2 ans n'est jamais rejouable en une fois). | Code (comportement observé) ; la loi ne dit pas comment rattraper. |

### Prorata (entrée/sortie en cours de mois)

| # | Règle | Source |
|---|---|---|
| P1 | Montant attendu = loyer_cc ; sinon HC + charges si l'un des deux est renseigné ; sinon `null`. Arrondi au centime. | Code `shared/echeancier.ts` l. 62-77 (`loyerCcPlein`). |
| P2 | Si la période est le PREMIER mois du bail et que le jour d'entrée > 1 : prorata = plein × joursOccupés / joursDuMois. | Code `shared/echeancier.ts` l. 80-95. |
| P3 | **Jours civils**, le jour d'entrée COMPTE comme occupé : joursOccupés = joursDuMois − jour + 1. | Code `shared/echeancier.ts` (`joursOccupes`), décision du 06/11 (ROADMAP « Échéancier réel »). ⚠️ La loi ne fixe pas la méthode (jours civils vs dixièmes) : **NON DÉTERMINÉ légalement**, le choix « jours civils » est celui du code. |
| P4 | Le jour d'entrée est borné au dernier jour du mois (entrée « 31 » en avril → 30). | Code `shared/echeancier.ts` `joursOccupes`. |
| P5 | L'entrée le 1ᵉʳ du mois → pas de prorata (mois plein). | Code + tests/echeancier.test.ts. |
| P6 | **SORTIE** : le code actuel IGNORE la date de fin — le mois de départ est dû ENTIER (aucun prorata de sortie). | Code `montantAttendu` (champ `date_fin_bail` absent de `BailEcheancier`). ⚠️ **NON DÉTERMINÉ** légalement (aucune règle de prorata de sortie citée dans le dépôt) : la sonde `date_fin_bail` du contrat sert à OBSERVER les divergences, pas à déclarer le code fautif. |
| P7 | Loyer 0 (parking gratuit fictif) : attendu = 0 (pas `null`). | Code `loyerCcPlein` (0 est une valeur valide). |

## 3. Frontières imposées dans les cas

- Entrée le 31 d'un mois de 30 (bornée à 30) ; le 29/02 bissextile ; le 29 d'un
  février non bissextile (borné à 28) ; le 28 d'un février 28 (dernier jour,
  1 jour d'occupation) ; l'entrée le 1ᵉʳ (mois plein).
- Loyer 0 (parking) et loyers null.
- Révision **non appliquée** par le bailleur (anneeDepart postérieure aux
  anniversaires disponibles).
- Bail de **moins de 12 mois** (debut tardif + anneeDepart courante).
- **Indices manquants** pour certaines années (tables tronquées).
- `tauxFixeAnnuel` en alternative à la table (R7).
- Trimestre de référence null, mal formé, avec année piégeuse (« T3 2023 »).

## 4. Référence temporelle gelée

`simulerRattrapageIrl` lit la date système (`new Date()`, R5/R10). Pour
l'étude : référence gelée au **2026-11-06**. Le générateur de cas garantit
qu'aucun anniversaire n'intervient entre le 06/11/2026 et le 30/11/2026
(mois de début limités à janvier…octobre + fév. pour les cas du 29) — les
résultats sont donc stables pendant l'étude. Toute exécution après le
30/11/2026 pourrait diverger : le jeu scellé s'exécute dans la fenêtre.

## 5. Jeu de cas VISIBLE (500)

- `cas-visibles-500.json`, généré par `generer-cas.mjs`, **seed 20261107**,
  déterministe (même seed = même fichier au bit près).
- 250 cas de révision + 250 cas de prorata, avec quotas de chaque famille de
  frontière du §3 (au moins : 10 entrées « 31 », 8 bissextiles, 10 loyers 0,
  15 indices manquants, 10 taux fixes, 10 baux < 12 mois, 15 sondes de
  sortie, 15 non-appliquées).
- Les cas sont des **ENTRÉES uniquement** (pas de résultat attendu) : chaque
  tentative exécute les 500 cas sur SON implémentation et écrit
  `attempt-<n>/resultats-visibles.json` au format :

```json
{
  "revision": { "R001": { "loyerSimule": 655.79, "revisionsJouees": 2, "deltaMois": 15.79, "deltaAn": 189.48, "loyerActuel": 640 } },
  "prorata": { "P001": 320.0 }
}
```
(clés = identifiants de cas ; seuls les champs utiles au jugement sont requis)

## 6. Contraintes des tentatives

- Fichiers : `attempt-<n>/impl-revision.ts`, `attempt-<n>/impl-prorata.ts`,
  `attempt-<n>/resultats-visibles.json`, `attempt-<n>/NOTES.md` (hésitations).
- Copie des fonctions autorisée et attendue (y compris la table IRL
  nécessaire) ; le code actuel est fourni EN LECTURE comme référence.
- **Interdits** : modifier le contrat, les cas, les tests, le code de l'app ;
  lire le contenu des autres tentatives ; coder en dur des résultats ;
  lire un fichier au runtime de l'implémentation (fonctions PURES —
  l'implémentation ne dépend que de ses arguments) ; utiliser des
  dépendances npm.
- Tentative disqualifiée si : résultat codé en dur, lecture de fichiers au
  runtime, signature non conforme à la compilation, ou résultat des 500 cas
  visibles identique au case-by-case du code actuel alors que le code a été
  recopié mot pour mot (copie non tentée = hors exercice, signalée).

## 7. Jeu scellé

Généré en phase 2 par `scelle/generer.mjs`, **seed 777777** (différent),
2 000 cas, mêmes familles et format que le jeu visible. Généré APRÈS le gel
des 8 tentatives ; aucune tentative n'y a accès (preuve : grep des dossiers).
