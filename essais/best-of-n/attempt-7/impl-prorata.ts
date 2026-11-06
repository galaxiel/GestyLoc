// ============================================================================
// attempt-7 — Réimplémentation de montantAttendu
// (CONTRAT §1b ; règles P1-P7)
//
// Réécrite depuis le CONTRAT, pas copiée de shared/echeancier.ts :
//   P1  plein = loyer_cc ; sinon HC + charges si l'un des deux est renseigné ;
//       sinon null — arrondi au centime ;
//   P2  premier mois du bail avec entrée > 1 → plein × jours occupés / jours
//       du mois ;
//   P3  jours CIVILS, le jour d'entrée compte : occupés = total − jour + 1 ;
//   P4  le jour d'entrée est borné au dernier jour du mois (« 31 » en avril
//       → 30 ; « 29 » en février non bissextile → 28) ;
//   P5  entrée le 1ᵉʳ → mois plein (pas de prorata) ;
//   P6  la date de fin est IGNORÉE : le mois de départ est dû ENTIER — le
//       champ date_fin_bail est une sonde du contrat, présente dans
//       l'interface mais volontairement absent du calcul ;
//   P7  loyer 0 valide (parking gratuit → 0, pas null).
//
// Fonction PURE : ne dépend que de ses arguments.
// ============================================================================

export interface BailEcheancier {
  date_debut_bail: string | null
  /**
   * ⚠ SONDE du contrat (P6) : lue par l'interface, JAMAIS par le calcul.
   * Aucune règle de prorata de sortie n'est définie — le mois de départ est
   * dû entier, comme les autres mois.
   */
  date_fin_bail?: string | null
  loyer_cc: number | null
  loyer_hc: number | null
  charges: number | null
}

/** Arrondi au centime le plus proche. */
function centimes(x: number): number {
  return Math.round(x * 100) / 100
}

/** Nb de jours d'un mois (gère le 29 février). */
function joursDansMois(annee: number, mois: number): number {
  return new Date(annee, mois, 0).getDate()
}

/**
 * P1/P7 : loyer charges comprises plein. loyer_cc d'abord (0 = valide) ;
 * sinon HC + charges si l'un des deux est renseigné (l'autre compte pour 0) ;
 * null seulement si aucun montant connu.
 */
function loyerPlein(bail: BailEcheancier): number | null {
  if (bail.loyer_cc != null) return centimes(bail.loyer_cc)
  if (bail.loyer_hc != null || bail.charges != null) {
    return centimes((bail.loyer_hc ?? 0) + (bail.charges ?? 0))
  }
  return null
}

/**
 * 'yyyy-mm' → [annee, mois] ; null si forme invalide ou mois hors 1-12
 * (une période illisible ne permet pas de situer le prorata).
 */
function parserPeriode(periode: string): [number, number] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periode ?? '')
  if (!m) return null
  const annee = parseInt(m[1], 10)
  const mois = parseInt(m[2], 10)
  return mois >= 1 && mois <= 12 ? [annee, mois] : null
}

/**
 * Date ISO 'yyyy-mm-dd' → période 'yyyy-mm' + jour (1-31). Null si illisible.
 * Le jour n'est PAS validé au calendrier ici : P4 le bornera au dernier jour
 * du mois VISÉ (« 2025-02-29 » hors bissextile → 28, « 2026-09-31 » → 30).
 */
function parserDateIso(
  iso: string | null | undefined
): { periode: string; jour: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return null
  const jour = parseInt(m[3], 10)
  if (jour < 1 || jour > 31) return null
  return { periode: `${m[1]}-${m[2]}`, jour }
}

/**
 * Montant attendu pour une période :
 *  - loyer CC plein (P1) ;
 *  - sauf au premier mois du bail avec entrée > 1 : prorata en jours civils,
 *    jour d'entrée compris (P2/P3), jour borné au dernier du mois (P4) ;
 *  - null si le bail n'a aucun loyer connu.
 */
export function montantAttendu(bail: BailEcheancier, periode: string): number | null {
  const plein = loyerPlein(bail)
  if (plein === null) return null

  // P6 : date_fin_bail volontairement ignorée — pas de prorata de sortie.

  const periodeCible = parserPeriode(periode)
  if (periodeCible === null) return plein // période illisible → mois plein
  const [annee, mois] = periodeCible

  const debut = parserDateIso(bail.date_debut_bail)
  if (debut === null || debut.periode !== periode) return plein // pas le 1er mois

  if (debut.jour <= 1) return plein // P5 : entrée le 1ᵉʳ → mois plein

  // P4 : jour borné au dernier jour du mois ; P3 : le jour d'entrée compte.
  const total = joursDansMois(annee, mois)
  const jourEntree = Math.min(Math.max(debut.jour, 1), total)
  const joursOccupes = total - jourEntree + 1

  return centimes((plein * joursOccupes) / total) // P2
}
