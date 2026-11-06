# fixtures/demo-30 — 30 dossiers locatifs synthétiques

Générés par `node scripts/gen_demo_30.mjs` (seed par défaut **20261106**,
démo figée à **novembre 2026**). Même seed → fichiers **identiques au bit près**.

| Fichier | Rôle |
|---|---|
| `baux.csv` | Format d'import de l'app (mapping par index 0..20, Excel-fr `;` + BOM). Importable via Paramètres → Données sur une **base vide**. |
| `paiements.csv` | Format d'export `paiements.csv` de l'app (7 colonnes). `bail_id` = ordre de ligne de `baux.csv` sur une base neuve. |
| `dossiers.json` | Manifest : compléments que l'import ne peut pas porter + valeurs attendues des invariants (consommé par `scripts/check_demo_30.mjs`). |

⚠️ **Tout est fictif** (noms, adresses, montants) ; les indices IRL cités sont
des valeurs INSEE publiques. Ne jamais charger ces données dans la vraie base
(%APPDATA%) — l'import refuse d'ailleurs toute base non vide.

## Les 30 dossiers

| Dossier | Ce qu'il exerce | Résultat attendu |
|---|---|---|
| D01 (simple) | simple | Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer. |
| D02 (simple) | simple | Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer. |
| D03 (simple) | simple | Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer. |
| D04 (simple) | simple | Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer. |
| D05 (simple) | simple | Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer. |
| D06 (simple) | simple | Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer. |
| D07 (simple) | simple | Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer. |
| D08 (simple) | simple | Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer. |
| D09 (simple) | simple | Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer. |
| D10 (simple) | simple | Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer. |
| D11 (prorata) | prorata | Entrée le 1ᵉʳ → loyer plein (540 €), branche « pas de prorata » du calcul. |
| D12 (prorata) | prorata | 1ᵉʳ mois attendu = prorata 16/30 j = 362.67 €, pointé « payé » sans être un partiel. |
| D13 (prorata) | prorata | 1ᵉʳ mois attendu = prorata 4/31 j = 77.42 €, pointé « payé » sans être un partiel. |
| D14 (prorata) | prorata | 1ᵉʳ mois attendu = prorata 1/30 j = 20 €, pointé « payé » sans être un partiel. |
| D15 (revision) | revision | 2 révisions appliquées (2024 puis 2026, 2025 sautée — cas réel) : loyer = HC × (IRL nouv / IRL ref) au centime à chaque étape ; plus d’alerte. |
| D16 (revision) | revision | 1 révision appliquée à l’anniversaire 2026 : nouveau HC = ancien HC × (IRL nouv / IRL ref), au centime ; plus d’alerte. |
| D17 (revision) | revision | IRL de référence renseigné, aucune révision appliquée depuis le début → alerte « révision IRL à l’anniversaire ». |
| D18 (revision) | revision | Dernière révision = anniversaire 2025 (taux IRL de l’année précédente) → anniversaire 2026 raté, alerte. |
| D19 (partiel) | partiel | Période 2026-10 pointée « partiel » à 353.1 € (sur 642 €) → REÇU de paiement, pas de quittance pour cette période. |
| D20 (partiel) | partiel | Période 2026-09 pointée « partiel » à 369.6 € (sur 616 €) → REÇU de paiement, pas de quittance pour cette période. |
| D21 (partiel) | partiel | Période 2026-10 pointée « partiel » à 300.8 € (sur 752 €) → REÇU de paiement, pas de quittance pour cette période. |
| D22 (impaye) | impaye | 1 période(s) pointée(s) « impayé » → 1 alerte(s) « impayé » au Dashboard (pas d'intensité croissante : cf. limites). |
| D23 (impaye) | impaye | 2 période(s) pointée(s) « impayé » → 2 alerte(s) « impayé » au Dashboard (pas d'intensité croissante : cf. limites). |
| D24 (impaye) | impaye | 3 période(s) pointée(s) « impayé » → 3 alerte(s) « impayé » au Dashboard (pas d'intensité croissante : cf. limites). |
| D25 (conge) | conge | Congé donné, fin dans ~44 jours → alerte « fin de bail », dépôt de garantie enregistré (restitution non modélisée). |
| D26 (conge) | conge | Bail clos (actif=false via complément — l’import force actif=1) → hors alertes, dépôt de 665 € à restituer (non modélisé). |
| D27 (regularisation) | regularisation | Charges provisionnelles (92 €/mois) + régularisation 2025 : réelles 844 €, écart 260 € (décompte PDF art. 23). |
| D28 (regularisation) | regularisation | Charges provisionnelles (78 €/mois) + régularisation 2025 : réelles 1076 €, écart -140 € (décompte PDF art. 23). |
| D29 (parking) | parking | Parking sans charges (colonne vide à l'import) → attendu = loyer CC = HC = 45 €, aucune régularisation possible. |
| D30 (colocation) | Colocation : 1 bien, 2 baux (moitié chacun) | 1 bien, 2 baux (1 par colocataire, moitié du loyer chacun) → 2 quittances par période possibles. |

## Limites connues (règles métier absentes du code — documentées, pas inventées)

1. **Colocation** : l'import crée 1 bien par ligne → les 2 lignes de D30 créent
   2 biens identiques que `check_demo_30.mjs` fusionne en post-import. L'app
   n'a pas de concept de colocation : 2 quittances par période (une par bail).
2. **Restitution du dépôt** : aucun champ/table n'existe — `depot_garantie`
   est un simple montant. Les 2 congés n'exercent donc que la clôture du bail.
3. **Paliers d'alerte impayés** : sévérité « urgent » uniquement pour le mois
   courant NON pointé (> 15 j de retard) ; un impayé POINTÉ reste « warning »
   quel que soit son âge → les paliers 1/2/3 mois = nombre d'alertes, pas
   d'intensité croissante.
4. **Congé/préavis** : pas de concept dédié — modélisé par `date_fin_bail`
   (+ `actif=false` en post-import pour le bail clos, l'import forçant
   `actif=1`).
5. **`taux_irl` d'un bail déjà révisé** : l'import recalcule le taux depuis la
   paire (ref, nouveau) ; après application réelle ref == nouveau → taux 0.
   Le manifest corrige `taux_irl` et `date_derniere_revision` en post-import.
6. **« 30 quittances générables »** : vérification au niveau DONNÉES — chaque
   dossier a ≥ 1 période pointée « payé » (art. 21) ; les périodes « partiel »
   donnent un reçu, pas de quittance. La génération PDF elle-même n'est pas
   testée par ce harnais.
7. **`commitImport` est lié à la boîte de dialogue native** : le vérificateur
   réplique son mapping colonne par colonne (aucun refactor autorisé) en
   réutilisant les vrais parseurs `shared/csv.ts` et le vrai calcul
   `shared/echeancier.ts`.
