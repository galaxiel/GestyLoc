# NOTES — attempt-7

Hésitations et choix tranchés (tous relisibles dans impl-revision.ts / impl-prorata.ts) :

1. **P6 / sonde `date_fin_bail`** : le contrat définit P6 (« mois de départ dû ENTIER ») comme règle et la sonde comme simple observatoire — je l'ignore donc dans le calcul (40 cas sondes) au lieu d'inventer un prorata de sortie non défini.
2. **Dates calendairement invalides** (P005, P150, P156, P233… « 2025-02-29 », « 2026-09-31 ») : je parse structurellement puis BORNE le jour au dernier du mois (esprit P4/R9), là où le code actuel laisse `Date()` rouler sur le mois suivant ; côté révision (aucun cas visible) même choix de bornage, et jour 0 / mois 13 → date illisible (R8).
3. **R6** : j'exige aussi indice courant > 0 (le code actuel accepterait un courant négatif → loyer négatif) ; courant = 0 → révision sautée comme lui. `tauxFixeAnnuel = 0` → ratio 1 mais révision COMPTEE (R7 littéral, comme le code actuel).
4. **Aucune table IRL embarquée** : R2/R6/R7 font de `irlParTrimestre` la seule source ; une table interne créerait une source parallèle non prévue par le contrat (cas map null + taux null → 0 révision).
5. Sur les 500 visibles : 0 divergence champ à champ avec le code actuel ; les choix 2-3 ne mordent que sur des entrées absentes des familles générées.
