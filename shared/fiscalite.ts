// ============================================================================
// Récapitulatif fiscal 2044 (revenus fonciers) — module PUR (aucune dépendance
// Node/Electron), consommé par la page Statistiques (affichage ET export PDF)
// et testé par vitest. Les biens meublés sont exclus (BIC/LMNP, 2031).
// ============================================================================

/** Recettes nettes nues au-delà desquelles le régime réel est obligatoire. */
export const SEUIL_MICRO_FONCIER = 15000

/** Abattement forfaitaire du micro-foncier (30 %). */
export const ABATTEMENT_MICRO = 0.7

export interface PaiementFiscal {
  bail_id: number
  periode: string
  statut: string
  montant_paye: number
}

export interface DepenseFiscale {
  date_depense: string | null
  montant: number
}

export interface RecetteParBail {
  bail_id: number
  recettes: number
}

export interface Recap2044 {
  recettes: number
  chargesDeductibles: number
  resultat: number
  microFoncier: boolean
  netMicro: number
  netReel: number
  /** Ventilation des recettes par bail (décroissante), pour le détail. */
  recettesParBail: RecetteParBail[]
}

const arrondi2 = (v: number): number => Math.round(v * 100) / 100

/**
 * Calcule le récap 2044 d'une année :
 * - recettes = paiements `paye`/`partiel` de l'année, hors baux meublés ;
 * - charges déductibles = toutes les dépenses datées de l'année ;
 * - régime conseillé : micro-foncier si recettes nues ≤ 15 000 €, sinon réel.
 */
export function calculerRecap2044(
  paiements: PaiementFiscal[],
  depenses: DepenseFiscale[],
  bauxMeubles: Set<number>,
  annee: number
): Recap2044 {
  const prefixe = String(annee)
  const parBail = new Map<number, number>()
  let recettes = 0

  for (const p of paiements) {
    if (!p.periode.startsWith(prefixe)) continue
    if (p.statut !== 'paye' && p.statut !== 'partiel') continue
    if (bauxMeubles.has(p.bail_id)) continue
    recettes += p.montant_paye
    parBail.set(p.bail_id, (parBail.get(p.bail_id) ?? 0) + p.montant_paye)
  }

  const chargesDeductibles = depenses
    .filter((d) => d.date_depense?.startsWith(prefixe))
    .reduce((s, d) => s + d.montant, 0)

  const resultat = recettes - chargesDeductibles
  const microFoncier = recettes <= SEUIL_MICRO_FONCIER

  const recettesParBail = [...parBail.entries()]
    .map(([bail_id, montant]) => ({ bail_id, recettes: arrondi2(montant) }))
    .sort((a, b) => b.recettes - a.recettes)

  return {
    recettes: arrondi2(recettes),
    chargesDeductibles: arrondi2(chargesDeductibles),
    resultat: arrondi2(resultat),
    microFoncier,
    netMicro: arrondi2(recettes * ABATTEMENT_MICRO),
    netReel: arrondi2(Math.max(resultat, 0)),
    recettesParBail
  }
}
