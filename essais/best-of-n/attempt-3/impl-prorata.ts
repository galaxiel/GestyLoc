// ============================================================================
// Tentative 3 — réimplémentation de montantAttendu (CONTRAT §1b, P1-P7).
//
// Fonction PURE : ne dépend QUE de ses arguments.
// Choix marquants vis-à-vis du code actuel (shared/echeancier.ts) :
//  1. P6 respecté à la lettre : la sonde `date_fin_bail` est DÉCLARÉE (le
//     contrat l'exige) mais IGNORÉE — le mois de départ est dû entier, aucun
//     prorata de sortie. Le contrat la fournit pour observer les divergences,
//     pas pour en inventer une règle (P6 : NON DÉTERMINÉ légalement).
//  2. Jours du mois calculés SANS `new Date(y, m, 0)` : arithmétique directe
//     (table + test de bissextilité) — même résultat, zéro dépendance à la
//     sémantique de roulis de Date.
//  3. La période n'est comparée qu'en chaîne 'yyyy-mm' ; elle n'est analysée
//     en nombres QUE si elle est exactement le mois d'entrée (elle est alors
//     forcément bien formée) — les périodes illisibles tombent dans « plein »
//     comme dans le code actuel, sans branche spéciale.
// ============================================================================

export interface BailEcheancier {
  date_debut_bail: string | null
  date_fin_bail?: string | null // ⚠ SONDE contrat §1b — ignorée (P6)
  loyer_cc: number | null
  loyer_hc: number | null
  charges: number | null
}

/** Arrondi au centime (P1/P2). */
function centimes(x: number): number {
  return Math.round(x * 100) / 100
}

/**
 * Loyer CC plein : loyer_cc ; sinon HC + charges si l'un des deux est
 * renseigné ; sinon null (P1, P7 : 0 est une valeur valide, pas un absent).
 * `!== null && !== undefined` (et non la seule vérité) pour ne pas confondre
 * un loyer de 0 avec un champ vide.
 */
function loyerCcPlein(bail: BailEcheancier): number | null {
  const cc = bail.loyer_cc
  if (cc !== null && cc !== undefined) return centimes(cc)
  const hc = bail.loyer_hc
  const charges = bail.charges
  const hcRenseigne = hc !== null && hc !== undefined
  const chargesRenseignees = charges !== null && charges !== undefined
  if (hcRenseigne || chargesRenseignees) return centimes((hc ?? 0) + (charges ?? 0))
  return null
}

/** 'yyyy-mm' extrait d'une date ISO (null si absent ou mal formé). */
function periodeDebut(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[1]}-${m[2]}` : null
}

/** Jour (1-31) d'une date ISO (null si absent ou hors 1-31). */
function jourEntree(iso: string | null | undefined): number | null {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso ?? '')
  const j = m ? parseInt(m[1], 10) : NaN
  return j >= 1 && j <= 31 ? j : null
}

function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
}

const JOURS_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Nb de jours du mois m (1-12) de l'année a — 29/02 si bissextile (P4). */
function joursDansMois(annee: number, mois: number): number {
  if (mois === 2 && estBissextile(annee)) return 29
  return JOURS_MOIS[mois - 1] ?? 31
}

/**
 * Jours occupés dans le mois d'entrée, jour d'entrée compris (P3), jour
 * borné au dernier du mois (P4 : entrée « 31 » en avril → 30).
 */
function joursOccupes(jour: number, total: number): number {
  const j = Math.min(Math.max(Math.trunc(jour), 1), total)
  return total - j + 1
}

/**
 * Montant attendu pour une période 'yyyy-mm' :
 *  - prorata du premier mois si entrée en cours de mois (P2, P3) ;
 *  - loyer CC plein sinon (P5 : entrée le 1ᵉʳ = mois plein) ;
 *  - null si aucun loyer connu (P1).
 * La date de fin de bail est ignorée : mois de départ dû ENTIER (P6).
 */
export function montantAttendu(bail: BailEcheancier, periode: string): number | null {
  const plein = loyerCcPlein(bail)
  if (plein === null) return null

  // Prorata uniquement si la période EST le mois d'entrée.
  const moisDebut = periodeDebut(bail.date_debut_bail)
  if (moisDebut === null || moisDebut !== periode) return plein

  const jour = jourEntree(bail.date_debut_bail)
  if (jour === null || jour <= 1) return plein // P5 : entrée le 1ᵉʳ → plein

  // Ici periode === 'yyyy-mm' du début : analysable sans surprise.
  const [a, m] = periode.split('-').map((x) => parseInt(x, 10))
  const total = joursDansMois(a, m)
  const occupe = joursOccupes(jour, total)
  return centimes((plein * occupe) / total) // P2 : prorata en jours civils
}
