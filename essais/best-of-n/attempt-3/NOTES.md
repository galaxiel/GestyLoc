# NOTES — Tentative 3

1. **`date_fin_bail` (sonde, P6)** — plus grosse hésitation : appliquer un prorata de sortie (intentions de la sonde) ou l'ignorer ? J'ignore, P6 est normatif (« le mois de départ est dû ENTIER ») et la note du contrat dit que la sonde OBSERVE les divergences sans déclarer le code fautif ; aucune règle sourcée ne définit de prorata de sortie.
2. **Borne temporelle** — gelée en constante au 2026-11-06 (R10/§4) au lieu du `new Date()` du code actuel : identique dans la fenêtre d'exécution, mais l'implémentation redevient pure et déterministe pour toujours.
3. **Date de début inexistante en révision** (ex. « 2025-04-31 ») — rejetée comme « illisible » (R8 → identique) alors que le code actuel la fait rouler au mois suivant ; invisible sur le jeu visible (le générateur n'en produit pas en révision), choix de fidélité à R8.
4. **Aucune table IRL embarquée** — autorisée par le protocole mais l'indice ne peut venir que de la map passée en argument (R2) : une table de secours ferait jouer des révisions que R6 impose de sauter (cas « tables tronquées »).
5. **`tauxFixeAnnuel = 0`** — compté comme révision jouée (ratio 1, arrondi no-op, compteur ++ ) : R7 ne l'exclut pas et c'est la seule lecture sourcée ; hésité à traiter 0 % comme « pas de révision ».
