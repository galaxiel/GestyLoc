// ============================================================================
// Best-of-N — attempt-2 — impl-prorata.ts
// Réimplémentation de montantAttendu depuis le CONTRAT (§1b, règles P1 à P7).
// Fonction PURE : aucun import, aucune E/S, aucune dépendance.
//
// Choix d'implémentation :
//  - date_fin_bail est déclarée dans l'interface (sonde du contrat) mais
//    VOLONTAIREMENT ignorée par le calcul : P6 pose que le mois de départ
//    reste dû entier, et aucune règle citée ne définit de prorata de sortie ;
//  - la date de début n'est JAMAIS portée en objet Date : année/mois/jour
//    sont extraits par regex et le jour d'entrée est borné au dernier jour
//    du mois (P4) — une entrée « 2026-02-31 » occupe donc le 28, elle ne
//    « reporte » pas au 03/03 ;
//  - les champs absents et null sont traités pareil : non renseignés (P1).
// ============================================================================

export interface BailEcheancier {
  date_debut_bail: string | null
  date_fin_bail?: string | null // ⚠ sonde du contrat — ignorée par le calcul (P6)
  loyer_cc: number | null
  loyer_hc: number | null
  charges: number | null
}

const JOURS_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Année bissextile grégorienne. */
function bissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
}

/** P3/P4 — Nb de jours d'un mois 1-12 (29/02 géré). */
export function joursDansMois(annee: number, mois1_12: number): number {
  if (mois1_12 === 2) return bissextile(annee) ? 29 : 28
  return JOURS_MOIS[mois1_12 - 1] ?? 31
}

/** P1 — Loyer CC plein : loyer_cc, sinon HC + charges si l'un des deux est
 * renseigné ; sinon null. Arrondi au centime. 0 est une valeur valide (P7 :
 * parking gratuit → 0, pas null). */
export function loyerCcPlein(bail: BailEcheancier): number | null {
  const hcRenseigne = bail.loyer_hc != null
  const chargesRenseignees = bail.charges != null
  let cc: number | null
  if (bail.loyer_cc != null) {
    cc = bail.loyer_cc
  } else if (hcRenseigne || chargesRenseignees) {
    cc = (bail.loyer_hc ?? 0) + (bail.charges ?? 0)
  } else {
    cc = null
  }
  return cc === null ? null : Math.round(cc * 100) / 100
}

/** P3 — Jours d'occupation dans le mois d'entrée, jour d'entrée compris :
 * entrée le 15 d'un mois de 30 → 16 jours. */
export function joursOccupes(jourEntree: number, annee: number, mois1_12: number): number {
  const total = joursDansMois(annee, mois1_12)
  const j = Math.min(Math.max(Math.trunc(jourEntree), 1), total) // P4 : borné
  return total - j + 1
}

/** 'yyyy-mm' → [annee, mois] (NaN si illisible). Lecture souple : « 2025-7 »
 * est accepté, les morceaux superflus sont ignorés. */
function parserPeriode(periode: string): [number, number] {
  const morceaux = String(periode).split('-')
  const annee = parseInt(morceaux[0] ?? '', 10)
  const mois = parseInt(morceaux[1] ?? '', 10)
  return [annee, mois]
}

/** Date ISO 'yyyy-mm-dd' → 'yyyy-mm' (analyse ancrée, null si illisible). */
function periodeDebut(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})/.exec(String(iso))
  return m ? `${m[1]}-${m[2]}` : null
}

/** Jour (1-31) extrait d'une date ISO 'yyyy-mm-dd' (null si illisible ou
 * hors 1-31). Extraction SANS Date : un jour inexistant reste lisible (P4). */
function jourDebut(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(String(iso))
  const j = m ? parseInt(m[1] ?? '', 10) : NaN
  return j >= 1 && j <= 31 ? j : null
}

/**
 * Montant attendu pour une période (P1/P2) :
 *  - prorata du premier mois si le bail commence en cours de mois
 *    (loyer CC plein × jours occupés ÷ jours du mois, arrondi au centime) ;
 *  - loyer CC plein sinon ;
 *  - null si le bail n'a aucun loyer connu.
 * P6 : le mois de départ est dû ENTIER — date_fin_bail n'entre pas dans le
 * calcul (aucune règle de prorata de sortie n'est définie au contrat).
 */
export function montantAttendu(bail: BailEcheancier, periode: string): number | null {
  // P1 : pas de loyer connu → null.
  const plein = loyerCcPlein(bail)
  if (plein === null) return null

  const [annee, mois] = parserPeriode(periode)
  if (Number.isNaN(annee) || Number.isNaN(mois)) return plein // période illisible

  // P2 : prorata uniquement sur le PREMIER mois du bail.
  const periodeEntree = periodeDebut(bail.date_debut_bail)
  if (periodeEntree === null || periodeEntree !== periode) return plein

  // P5 : entrée le 1ᵉʳ (ou jour illisible) → mois plein.
  const jourEntree = jourDebut(bail.date_debut_bail)
  if (jourEntree === null || jourEntree <= 1) return plein

  // P3/P4 : jours civils, jour d'entrée compris, borné au dernier jour.
  const occupe = joursOccupes(jourEntree, annee, mois)
  return Math.round(((plein * occupe) / joursDansMois(annee, mois)) * 100) / 100
}
