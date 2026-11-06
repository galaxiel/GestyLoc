# Attempt 4 — notes d'hésitation

1. **Sonde `date_fin_bail` (P6)** : j'ai choisi de l'IGNORER comme le code actuel — aucune règle sourcée ne définit de prorata de sortie, et les cas sondes vont jusqu'à placer la fin AVANT le début ; inventer une sortie proratée aurait été non sourcé. C'est mon plus grand pari de divergence potentielle.
2. **R6** : le contrat ne cite que « indice précédent ≤ 0 » ; j'ai aussi sauté la révision si l'indice COURANT est ≤ 0 (un ratio négatif ou infini n'a pas de sens métier). Ne peut fire que sur une table piégée.
3. **R4 (arrondi)** : conservé `Math.round(x*100)/100` avec le même ordre d'opérations que la règle sourcée — c'est elle qui fixe le comportement sur les demi-centimes flottants, pas la loi.
4. **R8 élargi** : loyer NaN traité comme « illisible » (résultat à l'identique) ; le littéral R8 ne couvre que ≤ 0. Hors familles de cas, pur défaut robuste.
5. **R7 avec taux 0** : ratio = 1 → révision COMPÉTÉE comme jouée (loyer inchangé) — fidèle au code, ambigu dans le contrat.
