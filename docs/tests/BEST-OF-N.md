# BEST-OF-N — Révision IRL & Prorata : verdict

> Étude du 06-07/11/2026, branche `essais/best-of-n` (non fusionnée).
> Méthode : contrat gelé (`essais/best-of-n/CONTRAT.md`) → 8 tentatives
> indépendantes par sous-agents → jeu scellé de 2 000 cas (seed 777777,
> jamais visible des tentatives) → jugement par un oracle écrit
> indépendamment des règles du contrat.
> Détail complet : `essais/best-of-n/jugement/matrice.json`.

## 1. Verdict en une phrase

**Le code actuel est juste sur tout cas non ambigu** : 2 485 cas sur 2 500
(500 visibles + 1 985 scellés) sont en UNANIMITÉ PARFAITE (les 9 colonnes +
l'oracle donnent la même valeur juste), et les 15 divergences relevées ne
concernent que des **dates de début inexistantes** (30/02, 31/02, 31/06,
29/02 non bissextile) — un cas que l'interface ne peut pas produire
(champ date HTML) et que le contrat ne tranchait pas (R8 « illisible » =
NON DÉTERMINÉ). **Aucune fusion : rien ne justifie de remplacer le code.**

## 2. Les trois familles (jeu scellé, 2 000 cas + jeu visible 500)

| Famille | Visible (500) | Scellé (2 000) | Signification |
|---|---|---|---|
| UNANIMITÉ OK | **500** | **1 985** | les 9 colonnes + l'oracle d'accord → confiance établie |
| UNANIMITÉ KO | 0 | **0** | aucun cas où les 9 se trompent ensemble → pas de bug systémique, pas de test faux |
| DIVERGENCE | 0 | **15** | au moins une implémentation diffère → ambiguïté de spec (voir §3) |

## 3. Les divergences — une seule cause racine

**Les 15 divergences portent toutes sur des dates de début inexistantes**
produites par le générateur scellé (jour 1-31 tiré pour tous les mois) :
`2024-02-31`, `2024-02-30`, `2022-02-29` (non bissextile), `2019-02-31`,
`2020-06-31`, `2024-02-29`… Trois lectures défendables s'affrontent :

- **Code actuel + oracle + 6 tentatives** (1, 2, 4, 5, 8 + oracle) : rollover
  `Date()` — le 31/06 roule au 1ᵉʳ juillet, le 29/02 non bissextile au 1ᵉʳ
  mars ; le trimestre d'indexation suit le mois roulé (2020-06-31 → juillet
  → T3) et l'anniversaire aussi.
- **attempt-3** (14 cas) : la date inexistante est « illisible » au sens R8 →
  bail non simulable, 0 révision, loyer inchangé. Défendable (données plus
  strictes) mais divergent du comportement établi de l'app.
- **attempt-6 et attempt-7** (1 cas, R0109) : le mois est lu LITTÉRALEMENT
  dans la chaîne (« 06 » → T2) alors que le rollover donne juillet (T3) —
  ratio d'indice différent, loyer 635,31 € vs 631,97 €.

**Tranché par le contrat** : R8 dit « date de début illisible » sans définir
ce qu'est une date structurellement invalide (NON DÉTERMINÉ au gel —
explicitement listé §2/R12 voisin). La règle appliquée pour trancher : le
comportement ROLLBACK `Date()` du code actuel EST la règle tant que le
contrat ne dit pas le contraire (le contrat décrit le code, mission
« prouver ou localiser », pas « remplacer »). Ces 15 cas sont donc classés
**ambiguïté de spec réelle** — la vraie réponse est produit : l'import et les
saisies ne peuvent pas produire ces dates (champ `<input type="date">`),
donc l'impact utilisateur est nul ; si un import CSV en amène un jour, la
question du rollover vs rejet devra être tranchée (attempt-3 est l'option
la plus défensive).

## 4. Gagnant ?

**Aucun.** Les 8 tentatives convergent avec le code actuel sur 2 485/2 500
cas, et les 15 divergences relèvent du NON DÉTERMINÉ du contrat — les
remplacer n'apporterait rien sur des cas jamais vus (elles ne divergent que
sur des entrées impossibles en pratique). Le code actuel reste tel quel sur
`main`. Notables au passage (qualité d'implémentation, sans fusion) :
attempt-3 (rejet strict des dates inexistantes — l'option la plus sûre si le
produit décide de durcir l'import), attempt-4/8 (date système gelée en
constante → fonctions redevenues pures et déterministes, un progrès réel sur
R10 si un jour la borne temporelle doit devenir injectable).

## 5. Ce que le contrat n'a pas su trancher (la vraie dette)

1. **Date de début structurellement invalide** (30/02, 31/06, 29/02 non
   bissextile) : illisible (R8, rejet) ou rollover `Date()` ? — NON DÉTERMINÉ,
   cause des 15 divergences. Source : absence de validation dans le code.
2. **Indice COURANT ≤ 0 ou manquant** : R6 ne cite que l'indice PRÉCÉDENT ;
   5 tentatives (1, 3, 5, 6, 7) sautent aussi si l'indice courant est
   invalide, le code actuel non (il accepterait un ratio ≈ 0 → loyer ≈ 0).
   Jamais déclenché par les jeux (indices > 0) — dette latente.
3. **Prorata de sortie** (P6) : le code ne prorate pas la sortie ; la loi
   n'est pas citée dans le dépôt ; les 8 tentatives ont toutes appliqué P6 à
   la lettre (sonde ignorée) → le sujet reste entièrement ouvert côté produit.
4. **Borne temporelle non injectable** (R10) : `new Date()` interne — gelée
   pour l'étude ; toute refonte devrait la passer en paramètre (attempt-4 et
   attempt-8 l'ont déjà fait dans leur copie).
5. **Taux fixe = 0** : compté comme révision jouée avec ratio 1 (R7 littéral)
   — 7 tentatives sur 8, le code actuel idem ; sémantique discutable
   (une révision à 0 % est-elle « jouée » ?), sans impact financier.
6. **Méthode du prorata** (jours civils vs dixièmes) : NON DÉTERMINÉ
   légalement — le choix « jours civils, jour d'entrée compris » est celui du
   code, validé à l'unanimité par les tentatives comme lecture du contrat.

## Effectifs et preuves d'exécution

- Colonnes : 9 (code actuel + attempt-1…8, aucune exclue, aucune disqualifiée)
- Jeu visible : 500 cas (seed 20261107) — généré AVANT les tentatives
- Jeu scellé : 2 000 cas (seed 777777) — généré APRÈS le gel (commit
  `69f90ac`), étanchéité prouvée : `grep -rl "777777|cas-scelle"
  attempt-*/` → 0 fichier
- Matrice brute : `essais/best-of-n/jugement/matrice.json`
- Relances notées : 8 échecs de concurrence plateforme au lancement initial
  (par vagues de 2 ensuite), chaque tentative livrée au plus au 2ᵉ essai
