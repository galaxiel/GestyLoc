// ============================================================================
// attempt-5 — impl-prorata.ts
// Réimplémentation de montantAttendu depuis le CONTRAT §2 (P1-P7).
// Fonction PURE : aucun import, aucune E/S.
//
// Choix propres à cette tentative : la sonde `date_fin_bail` (§1b) est
// DÉCLARÉE dans l'interface mais JAMAIS lue — P6 tranche : le mois de départ
// est dû ENTIER, aucun prorata de sortie. Les cas-sondes (y compris ceux où
// la fin précède le début) ne doivent produire aucune divergence.
// ============================================================================

export interface BailEcheancier {
  date_debut_bail: string | null
  date_fin_bail?: string | null // ⚠ SONDE contrat §1b — observée, jamais utilisée (P6)
  loyer_cc: number | null
  loyer_hc: number | null
  charges: number | null
}

/** Arrondi au centime (P1/P2). */
const auCentime = (x: number): number => Math.round(x * 100) / 100

/** P1/P7 : loyer plein = loyer_cc ; sinon HC + charges si l'un des deux est
 * renseigné ; sinon null. 0 est une valeur valide (parking gratuit). */
function loyerPlein(bail: BailEcheancier): number | null {
  const hc = bail.loyer_hc ?? null
  const charges = bail.charges ?? null
  const cc = bail.loyer_cc ?? (hc !== null || charges !== null ? (hc ?? 0) + (charges ?? 0) : null)
  return cc === null ? null : auCentime(cc)
}

/** 'yyyy-mm' -> [annee, mois] (NaN si illisible — parseInt tolérant). */
function decouperPeriode(periode: string): [number, number] {
  const [a, m] = String(periode ?? '').split('-').map((x) => parseInt(x, 10))
  return [a, m]
}

/** Date ISO 'yyyy-mm-dd' -> 'yyyy-mm' (null si illisible). */
function moisDeDateIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  return m ? `${m[1]}-${m[2]}` : null
}

/** Jour (1-31) d'une date ISO 'yyyy-mm-dd' (null sinon). */
function jourDeDateIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso)
  const j = m ? parseInt(m[1], 10) : NaN
  return j >= 1 && j <= 31 ? j : null
}

/** Nb de jours du mois (mois 1-12 ; 29 février géré). */
const joursDansMois = (annee: number, mois: number): number => new Date(annee, mois, 0).getDate()

/**
 * Montant attendu pour la période (P1-P7) :
 *  - loyer plein (P1) sauf si la période est le PREMIER mois du bail avec une
 *    entrée après le 1ᵉʳ (P2) : prorata en jours civils, jour d'entrée compris
 *    (P3 : total − jour + 1), jour borné au dernier jour du mois (P4) ;
 *  - entrée le 1ᵉʳ → mois plein (P5) ;
 *  - date_fin_bail ignorée : mois de départ dû entier (P6) ;
 *  - null si aucun loyer connu ; 0 restitué tel quel (P7).
 */
export function montantAttendu(bail: BailEcheancier, periode: string): number | null {
  const plein = loyerPlein(bail)
  if (plein === null) return null
  const [annee, mois] = decouperPeriode(periode)
  if (Number.isNaN(annee) || Number.isNaN(mois)) return plein

  const dateDebut = bail.date_debut_bail ?? null
  if (moisDeDateIso(dateDebut) !== periode) return plein // pas le mois d'entrée

  const jourEntree = jourDeDateIso(dateDebut)
  if (jourEntree === null || jourEntree <= 1) return plein // P5

  // P2/P3/P4 : jours civils, jour d'entrée compris, borné au dernier jour.
  const total = joursDansMois(annee, mois)
  const occupes = total - Math.min(Math.max(Math.trunc(jourEntree), 1), total) + 1
  return auCentime((plein * occupes) / total)
}
