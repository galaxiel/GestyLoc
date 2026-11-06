# NOTES — attempt 6

1. **date_fin_bail (P6)** — volontairement IGNORÉE : le contrat ne définit aucune règle de prorata de sortie et précise que la sonde sert à observer les divergences, pas à déclarer le code fautif → mois de départ dû entier (40 cas visibles). Plus grosse hésitation : implémenter une sortie symétrique de l'entrée aurait été d'inventer une règle absente du seul texte de référence.
2. **Référence temporelle** : gelée en constante `new Date(2026, 10, 6)` (§4/R10) au lieu de `new Date()` — identique dans la fenêtre d'exécution garantie, reproductible au bit près à toute date.
3. **Source d'indice** : la map passée en argument est la SEULE source (les cas portent des valeurs perturbées ≠ table INSEE publique) → aucune table IRL embarquée ; si map ET taux étaient tous deux null → révisions sautées (R6 ; jamais rencontré dans le visible). J'exige aussi `cour > 0` (R6 ne le cite pas : un ratio ≤ 0 annulerait le loyer et bloquerait toutes les années suivantes).
4. **Dates de début** : parsing ancré complet + mois validé + jour borné au dernier du mois (esprit R9) au lieu du report au mois suivant du code actuel (2023-04-31 → 30/04, pas 01/05) ; date illisible → R8 à l'identique.
5. **taux = 0** : révision comptée comme jouée (ratio 1 appliqué + arrondi, R4/R7) ; `loyerHcActuel` NaN traité comme non positif → R8 à l'identique.

Vérification : réimplémentation indépendante des règles en Python (0 divergence sur les 500 cas visibles).
