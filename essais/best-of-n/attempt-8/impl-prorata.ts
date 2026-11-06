// ============================================================================
// Tentative 8 — Réimplémentation de montantAttendu (CONTRAT §1b).
// Règles P1–P7 du CONTRAT §2 ; fonction PURE (aucune I/O, aucune dépendance).
// La sonde `date_fin_bail` est DÉCLARÉE dans l'interface (CONTRAT §1b) mais
// volontairement ignorée par le calcul : P6 tranche — le mois de départ est
// dû ENTIER, aucun prorata de sortie n'est déterminé par le contrat, la sonde
// sert à observer les divergences, pas à en créer une.
// ============================================================================

export interface BailEcheancier {
  date_debut_bail: string | null
  date_fin_bail?: string | null // ⚠ SONDE du contrat (P6) — non utilisée dans le calcul
  loyer_cc: number | null
  loyer_hc: number | null
  charges: number | null
}

/** Arrondi au centime (P1). */
function centimes(x: number): number {
  return Math.round(x * 100) / 100
}

/**
 * P1/P7 — loyer CC plein : loyer_cc tel quel (0 est une valeur valide, P7) ;
 * sinon HC + charges si l'un des deux est renseigné (l'autre compte 0) ;
 * sinon null. Arrondi au centime.
 */
function loyerCcPlein(bail: BailEcheancier): number | null {
  if (bail.loyer_cc !== null && bail.loyer_cc !== undefined) return centimes(bail.loyer_cc)
  if (bail.loyer_hc !== null || bail.charges !== null) {
    return centimes((bail.loyer_hc ?? 0) + (bail.charges ?? 0))
  }
  return null
}

/** 'yyyy-mm-dd' → 'yyyy-mm' (null si la forme est absente/illisible). */
function periodeDeDebut(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[1]}-${m[2]}` : null
}

/** Jour (1..31) d'une date 'yyyy-mm-dd' — null si absent ou hors plage. */
function jourDeDebut(iso: string | null | undefined): number | null {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso ?? '')
  const j = m ? Number(m[1]) : NaN
  return j >= 1 && j <= 31 ? j : null
}

/** 'yyyy-mm' → [annee, mois] (NaN si illisible). */
function parsePeriode(periode: string): [number, number] {
  const m = /^(\d{4})-(\d{2})/.exec(periode)
  return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN]
}

/** Année bissextile grégorienne. */
function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
}

/** Nb de jours du mois 1..12 (29 février géré sans artifice de rollover). */
function joursDansMois(annee: number, mois1_12: number): number {
  const longueurs = [31, estBissextile(annee) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return longueurs[mois1_12 - 1] ?? 31
}

/**
 * Montant attendu pour une période 'yyyy-mm' :
 *  - loyer CC plein (P1), sauf sur le PREMIER mois du bail (P2) ;
 *  - ce mois-là, si l'entrée est après le 1ᵉʳ (P5) : plein × joursOccupés /
 *    joursDuMois, en JOURS CIVILS le jour d'entrée comptant (P3 : total −
 *    jour + 1), le jour d'entrée étant borné au dernier jour du mois (P4) ;
 *  - null si le bail n'a aucun loyer connu.
 * P6 : la date de fin (sonde) est ignorée — le mois de départ est dû entier.
 */
export function montantAttendu(bail: BailEcheancier, periode: string): number | null {
  const plein = loyerCcPlein(bail)
  if (plein === null) return null // P1

  // Prorata uniquement sur le premier mois du bail (comparaison 'yyyy-mm').
  if (periodeDeDebut(bail.date_debut_bail) !== periode) return plein

  const jourEntree = jourDeDebut(bail.date_debut_bail)
  if (jourEntree === null || jourEntree <= 1) return plein // P5 — mois plein

  const [annee, mois] = parsePeriode(periode)
  if (Number.isNaN(annee) || Number.isNaN(mois) || mois < 1 || mois > 12) return plein

  const total = joursDansMois(annee, mois)
  const jour = Math.min(Math.max(Math.trunc(jourEntree), 1), total) // P4
  const joursOccupes = total - jour + 1 // P3 — jour d'entrée compris
  return centimes((plein * joursOccupes) / total) // P2
}
