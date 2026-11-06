// ============================================================================
// Attempt 4 — montantAttendu, réimplémenté depuis le CONTRAT §2 (P1-P7).
//
// Principes retenus (chacun rattaché à sa règle) :
//   P1  loyer_cc d'abord ; sinon HC + charges si l'UN DES DEUX est renseigné
//       (le manquant compte pour 0) ; sinon null. Arrondi au centime.
//   P7  0 est une valeur pleine valide (parking gratuit) — testé via null only.
//   P2  prorata uniquement si la période demandée EST le mois d'entrée
//       et que le jour d'entrée > 1.
//   P3  jours CIVILS, jour d'entrée compris : occupés = jours du mois − jour + 1.
//   P4  jour d'entrée borné au dernier jour du mois (31 en avril → 30).
//   P5  entrée le 1ᵉʳ → mois plein, jamais de prorata.
//   P6  la sonde `date_fin_bail` est lue par la signature mais IGNORÉE par le
//       calcul : aucune règle sourcée ne définit de prorata de sortie, le mois
//       de départ reste dû entier. (Les cas sondes vont jusqu'à placer une
//       fin AVANT le début — inventer un comportement serait non sourcé.)
// Période illisible → mois plein (seule valeur défendable : on sait payer,
// on ne sait pas prorater). Fonction PURE : ne dépend que de ses arguments.
// ============================================================================

export interface BailEcheancier {
  date_debut_bail: string | null
  /** Sonde du contrat §1b : volontairement sans effet (P6). */
  date_fin_bail?: string | null
  loyer_cc: number | null
  loyer_hc: number | null
  charges: number | null
}

/** Renseigné = présent et non null (0 compte comme renseigné, P7). */
function renseigne(v: number | null | undefined): boolean {
  return v !== null && v !== undefined
}

/** Nb de jours du mois (gestion du 29 février) ; new Date(a, m, 0) = dernier jour. */
function joursDuMois(annee: number, mois1_12: number): number {
  return new Date(annee, mois1_12, 0).getDate()
}

/** 'yyyy-mm' (parties numériques, surplus ignoré) → [annee, mois] ; NaN si illisible. */
function anMoisDePeriode(periode: string): [number, number] {
  const morceaux = periode.split('-')
  return [parseInt(morceaux[0], 10), parseInt(morceaux[1] ?? '', 10)]
}

/** 'yyyy-mm-dd' → 'yyyy-mm' (préfixe) ; null si absent ou non conforme. */
function moisDebut(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4}-\d{2})/.exec(iso)
  return m ? m[1] : null
}

/** Jour (1-31) d'une date ISO ; null si absent, non numérique ou hors bornes. */
function jourEntree(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso)
  const j = m ? parseInt(m[1], 10) : NaN
  return j >= 1 && j <= 31 ? j : null
}

/** P1 + P7 : loyer charges comprises plein du bail, arrondi au centime ; null si rien. */
function loyerCcPlein(bail: BailEcheancier): number | null {
  let cc: number | null
  if (renseigne(bail.loyer_cc)) {
    cc = bail.loyer_cc as number
  } else if (renseigne(bail.loyer_hc) || renseigne(bail.charges)) {
    cc = (bail.loyer_hc ?? 0) + (bail.charges ?? 0)
  } else {
    return null
  }
  return Math.round(cc * 100) / 100
}

/**
 * Montant attendu pour une période :
 *  - mois d'entrée avec jour > 1 → plein × jours occupés / jours du mois (P2-P4) ;
 *  - sinon loyer CC plein (P1) ; null si aucun loyer connu.
 */
export function montantAttendu(bail: BailEcheancier, periode: string): number | null {
  const plein = loyerCcPlein(bail)
  if (plein === null) return null

  const [annee, mois] = anMoisDePeriode(periode)
  if (Number.isNaN(annee) || Number.isNaN(mois)) return plein

  // Hors mois d'entrée (y compris période antérieure/ultérieure) → plein.
  if (moisDebut(bail.date_debut_bail) !== periode) return plein

  const jour = jourEntree(bail.date_debut_bail)
  if (jour === null || jour <= 1) return plein // P5 (entrée le 1ᵉʳ = mois plein)

  // P3/P4 : jour borné au dernier jour du mois, jour d'entrée compris.
  const total = joursDuMois(annee, mois)
  const j = Math.min(Math.max(Math.trunc(jour), 1), total)
  const occupes = total - j + 1
  return Math.round((plein * occupes) / total * 100) / 100
}
