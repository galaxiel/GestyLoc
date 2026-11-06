# NOTES — attempt 8

- **Sonde `date_fin_bail` (40/250 cas prorata)** : appliqué P6 à la lettre — mois de sortie dû ENTIER, champ ignoré dans le calcul. Le contrat dit que la sonde OBSERVE les divergences sans déclarer le code fautif ; inventer un prorata de sortie aurait créé une règle que le contrat ne contient pas.
- **Référence temporelle (R10)** : gelée en constante `2026-11-06` (§4) au lieu de `new Date()` — identique pendant la fenêtre d'étude mais déterministe au-delà ; seule divergence structurelle d'avec le code actuel.
- **R6** : je saute aussi l'année si l'indice COURANT ≤ 0 (le contrat ne cite que l'indice précédent ; le code actuel ignore cour = 0 incidemment via la vérité de `cour &&`). Aucun cas visible concerné, choix défensif.
- **Taux fixe 0** (4 cas) : ratio = 1 → révision quand même « jouée » (`revisionsJouees++`), fidèle à la lettre de R7/R4.
- **Mois hors 1-12 dans la période** : mois plein (défensif, absent du jeu) ; jours du mois calculés par table + bissextile grégorienne, sans artifice de rollover Date.
