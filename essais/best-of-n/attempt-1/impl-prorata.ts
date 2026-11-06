// ============================================================================
// Tentative 1 — Best-of-N GestyLoc : réimplémentation de montantAttendu
// depuis le CONTRAT (essais/best-of-n/CONTRAT.md §1b et §2, règles P1-P7).
//
// Fonction PURE : aucun import, aucune E/S, aucune dépendance npm.
//
// Choix structurants (détails dans NOTES.md) :
//   - P6 : la sonde date_fin_bail est volontairement IGNOREE. Le contrat
//     fixe la règle « mois de départ dû ENTIER, aucun prorata de sortie » ;
//     la sonde sert à OBSERVER les divergences entre tentatives, pas à
//     autoriser l'invention d'une règle de sortie que le contrat ne définit
//     pas (jour de départ compté ou non ? jours civils ou dixièmes ? tout
//     cela est NON DÉTERMINÉ — deviner serait ajouter une règle absente).
//   - P1/P7 : loyer_cc = 0 est une valeur valide (parking gratuit) — seul
//     null/undefined bascule vers HC + charges, puis vers null.
//   - P4 : extraction du JOUR par sous-chaîne puis bornage au dernier jour
//     du mois — une date non calendaire (2025-02-29, 2026-02-31) reste
//     traitable, le bornage EST le comportement spécifié.
//   - joursDansMois en arithmétique pure (table + règle bissextile), sans
//     l'artifice new Date(annee, mois, 0).
//   - Champs tolérants à undefined (champ JSON absent == null) : un champ
//     ABSENT n'est pas « renseigné » au sens de P1.
// ============================================================================

export interface BailEcheancier {
  date_debut_bail: string | null
  date_fin_bail?: string | null // ⚠ sonde du contrat : lue JAMAIS (P6, cf. en-tête)
  loyer_cc: number | null
  loyer_hc: number | null
  charges: number | null
}

// ---------------------------------------------------------------------------
// Helpers purs
// ---------------------------------------------------------------------------

const JOURS_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
}

/** Nb de jours dans un mois (P3/P4 : gère le 29 février). */
function joursDansMois(annee: number, mois1_12: number): number {
  if (mois1_12 < 1 || mois1_12 > 12) return 0 // jamais atteint : parsePeriode filtre
  const base = JOURS_MOIS[mois1_12 - 1]
  return mois1_12 === 2 && estBissextile(annee) ? 29 : base
}

/** 'yyyy-mm' -> [annee, mois 1-12], null si mal formé ou hors 1-12. */
function parsePeriode(periode: string): [number, number] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periode)
  if (!m) return null
  const annee = parseInt(m[1], 10)
  const mois = parseInt(m[2], 10)
  return mois >= 1 && mois <= 12 ? [annee, mois] : null
}

/** Date ISO 'yyyy-mm-dd' -> 'yyyy-mm' (préfixe), null si illisible. */
function periodeDeDateIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  return m ? `${m[1]}-${m[2]}` : null
}

/** Jour (1-31) extrait d'une date ISO 'yyyy-mm-dd' (préfixe), null sinon. */
function jourDeDateIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso)
  const j = m ? parseInt(m[1], 10) : NaN
  return j >= 1 && j <= 31 ? j : null
}

/** P2/P3/P4 : jours d'occupation dans le mois d'entrée, JOURS CIVILS, le
 * jour d'entrée comptant (entrée le 15 d'un mois de 30 -> 16 jours) ;
 * jour borné au dernier jour du mois (entrée « 31 » en avril -> 30). */
function joursOccupes(jourEntree: number, annee: number, mois1_12: number): number {
  const total = joursDansMois(annee, mois1_12)
  const j = Math.min(Math.max(Math.trunc(jourEntree), 1), total)
  return total - j + 1
}

/** P1/P7 : loyer CC plein = loyer_cc ; sinon HC + charges si l'un des deux
 * est renseigné ; sinon null. Arrondi au centime. 0 est une valeur valide. */
function loyerCcPlein(bail: BailEcheancier): number | null {
  let cc: number
  if (bail.loyer_cc != null) {
    cc = bail.loyer_cc
  } else if (bail.loyer_hc != null || bail.charges != null) {
    cc = (bail.loyer_hc ?? 0) + (bail.charges ?? 0)
  } else {
    return null
  }
  return Math.round(cc * 100) / 100
}

// ---------------------------------------------------------------------------
// Montant attendu
// ---------------------------------------------------------------------------

export function montantAttendu(bail: BailEcheancier, periode: string): number | null {
  // P1 : aucun loyer connu -> null (avant toute considération de période).
  const plein = loyerCcPlein(bail)
  if (plein === null) return null

  // Période illisible : elle ne peut pas être le mois d'entrée -> mois plein.
  const parsee = parsePeriode(periode)
  if (parsee === null) return plein

  // P2 : prorata UNIQUEMENT au premier mois du bail.
  const periodeDebut = periodeDeDateIso(bail.date_debut_bail)
  if (periodeDebut === null || periodeDebut !== periode) return plein

  // P5 : entrée le 1ᵉʳ (ou jour illisible) -> mois plein.
  const jourEntree = jourDeDateIso(bail.date_debut_bail)
  if (jourEntree === null || jourEntree <= 1) return plein

  // P2/P3/P4 : plein × joursOccupés / joursDuMois, arrondi au centime.
  const [annee, mois] = parsee
  const occupe = joursOccupes(jourEntree, annee, mois)
  // Même ordre d'opérations que le code de référence (pas de divergence de
  // virgule flottante gratuite) : (plein * occupe) / total.
  return Math.round(((plein * occupe) / joursDansMois(annee, mois)) * 100) / 100
}
