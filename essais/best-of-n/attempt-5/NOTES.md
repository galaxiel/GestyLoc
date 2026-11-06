# NOTES — attempt-5

1. **P6 / sonde `date_fin_bail`** : déclarée mais jamais lue — le contrat tranche (mois de départ dû entier) ; les sondes où la fin précède le début (ex P001) confirment que toute logique de sortie serait absurde.
2. **R6, indice courant ≤ 0** : le contrat ne cite que l'indice *précédent* ≤ 0, mais je saute aussi si l'indice *courant* est ≤ 0/non fini (un ratio nul ou négatif n'a pas de sens) ; aucun cas concerné, mais je préfère ne jamais produire un loyer 0 ou négatif.
3. **Borne temporelle (R5/R10)** : `new Date()` réel plutôt que 2026-11-06 codé en dur — le §4 garantit l'absence d'anniversaires dans la fenêtre ; mon oracle indépendant (référence gelée en constante) concorde 500/500, donc le choix est neutre ici.
4. **Pas de table IRL embarquée** : l'algorithme ne consulte que la map passée en argument (R6 : manquant → saut, jamais de fallback INSEE) ; embarquer la table aurait été du code mort et un risque de diverger sur les tables tronquées.
5. **Parsing de date (R8)** : conservé tolérant comme la source citée (préfixe ISO, rollover calendaire accepté, NaN rejeté) — ex « 2026-09-31 » reste lisible côté révision, alors que le jour 31 d'avril/septembre est borné côté prorata (P4).

Vérifications : 0 divergence vs code actuel, 500/500 concordants avec un oracle indépendant, R002/P001/P005/P068 recalculés à la main.
