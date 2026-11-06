// ============================================================================
// Best-of-N — attempt 6 — impl-prorata.ts
// Réimplémentation de montantAttendu depuis le CONTRAT (§1b, règles P1-P7).
// Fonction PURE : aucune dépendance, aucune E/S.
//
// Choix structurant : la sonde date_fin_bail est acceptée par l'interface
// (contrat §1b) mais volontairement NON exploitée — P6 : le mois de départ
// est dû ENTIER, aucune règle de prorata de sortie n'est déterminée dans le
// contrat, et la sonde « sert à OBSERVER les divergences, pas à déclarer le
// code fautif ». Inventer une formule de sortie serait créer une règle
// absente du contrat, seule référence de jugement.
// ============================================================================

export interface BailEcheancier {
  date_debut_bail: string | null
  date_fin_bail?: string | null // ⚠ SONDE contrat P6 — lue nulle part
  loyer_cc: number | null
  loyer_hc: number | null
  charges: number | null
}

/** Nb de jours dans un mois (29 février géré par Date ; mois 1-12). */
function joursDansMois(annee: number, mois1_12: number): number {
  return new Date(annee, mois1_12, 0).getDate()
}

/** 'yyyy-mm' -> [annee, mois] (NaN si illisible). */
function parsePeriode(periode: string): [number, number] {
  const [a, m] = periode.split('-').map((x) => parseInt(x, 10))
  return [a, m]
}

/** Date ISO 'yyyy-mm-dd' -> 'yyyy-mm' (null si illisible). */
function periodeDeDateIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  return m ? `${m[1]}-${m[2]}` : null
}

/** Jour (1-31) extrait d'une date ISO 'yyyy-mm-dd' (null si illisible). */
function jourDeDateIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso)
  const j = m ? parseInt(m[1], 10) : NaN
  return j >= 1 && j <= 31 ? j : null
}

/**
 * P3/P4 : jours occupés dans le mois d'entrée — JOURS CIVILS, le jour
 * d'entrée COMPTE : total − jour + 1. Le jour est borné au dernier jour du
 * mois (entrée « 31 » en avril -> 30, « 29/02 » non bissextile -> 28, soit
 * 1 seul jour occupé) et borné bas à 1.
 */
function joursOccupes(jourEntree: number, annee: number, mois1_12: number): number {
  const total = joursDansMois(annee, mois1_12)
  const j = Math.min(Math.max(Math.trunc(jourEntree), 1), total)
  return total - j + 1
}

/**
 * P1/P7 : loyer CC plein = loyer_cc ; sinon HC + charges si l'un des deux est
 * renseigné (le manquant vaut 0) ; sinon null. 0 est une valeur VALIDE
 * (parking gratuit), pas une absence. Arrondi au centime.
 */
function loyerCcPlein(bail: BailEcheancier): number | null {
  const cc =
    bail.loyer_cc ??
    (bail.loyer_hc !== null || bail.charges !== null
      ? (bail.loyer_hc ?? 0) + (bail.charges ?? 0)
      : null)
  if (cc === null) return null
  return Math.round(cc * 100) / 100
}

/**
 * Montant attendu pour une période :
 *  - P2 : prorata du premier mois (plein × joursOccupés / joursDuMois,
 *    arrondi au centime) si la période EST le mois d'entrée et que le jour
 *    d'entrée > 1 ;
 *  - P5 : entrée le 1ᵉʳ -> mois plein ;
 *  - mois plein sinon, y compris le mois de départ (P6 : date_fin_bail
 *    volontairement ignorée) et si la période est illisible ;
 *  - P1 : null si le bail n'a aucun loyer connu.
 */
export function montantAttendu(bail: BailEcheancier, periode: string): number | null {
  const plein = loyerCcPlein(bail)
  if (plein === null) return null

  const [annee, mois] = parsePeriode(periode)
  if (isNaN(annee) || isNaN(mois)) return plein

  const periodeDebut = periodeDeDateIso(bail.date_debut_bail)
  if (!periodeDebut || periodeDebut !== periode) return plein // hors mois d'entrée

  const jourEntree = jourDeDateIso(bail.date_debut_bail)
  if (jourEntree === null || jourEntree <= 1) return plein // P5 / jour illisible

  const total = joursDansMois(annee, mois)
  const occupe = joursOccupes(jourEntree, annee, mois)
  return Math.round(((plein * occupe) / total) * 100) / 100 // P2/P3
}
