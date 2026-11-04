// ============================================================================
// Échéancier réel : loyer dû par mois pour un bail, jour de paiement,
// prorata du premier mois (entrée dans les lieux en cours de mois).
//
// Fonctions PURES (aucune dépendance Node/Electron) : utilisables côté main
// (alertes) et côté renderer (pointage, calendrier), et testées par vitest.
//
// Choix de méthode (tranché à l'implémentation, ROADMAP « Échéancier réel ») :
//   prorata en JOURS CIVILS — le jour d'entrée compte comme jour d'occupation
//   (le locataire occupe du jour J au dernier jour du mois). La méthode en
//   dixièmes (courtier) reste possible plus tard : tout passe par
//   joursOccupes() qui est le seul point à changer.
// ============================================================================

/** Nb de jours dans un mois (gestion du 29 février). */
export function joursDansMois(annee: number, mois1_12: number): number {
  return new Date(annee, mois1_12, 0).getDate()
}

/** 'yyyy-mm' -> [annee, mois] (NaN si format invalide). */
export function parsePeriode(periode: string): [number, number] {
  const [a, m] = periode.split('-').map((x) => parseInt(x, 10))
  return [a, m]
}

/** Date ISO 'yyyy-mm-dd' -> 'yyyy-mm' (null si invalide). */
export function periodeDeDateIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  return m ? `${m[1]}-${m[2]}` : null
}

/** Jour (1-31) extrait d'une date ISO 'yyyy-mm-dd' (null si invalide). */
export function jourDeDateIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso)
  const j = m ? parseInt(m[1], 10) : NaN
  return j >= 1 && j <= 31 ? j : null
}

/**
 * Jours d'occupation dans le mois d'entrée, jour d'entrée compris.
 * ex : entrée le 15 d'un mois de 30 j -> 16 jours.
 */
export function joursOccupes(jourEntree: number, annee: number, mois1_12: number): number {
  const total = joursDansMois(annee, mois1_12)
  const j = Math.min(Math.max(Math.trunc(jourEntree), 1), total)
  return total - j + 1
}

/** Champs du bail utilisés par le calcul (sous-ensemble typé souple). */
export interface BailEcheancier {
  date_debut_bail: string | null
  loyer_cc: number | null
  loyer_hc: number | null
  charges: number | null
}

/**
 * Loyer CC plein du bail (loyer_cc, sinon HC + charges), arrondi au centime.
 * null si aucun montant connu.
 */
export function loyerCcPlein(bail: BailEcheancier): number | null {
  const cc =
    bail.loyer_cc ??
    (bail.loyer_hc !== null || bail.charges !== null
      ? (bail.loyer_hc ?? 0) + (bail.charges ?? 0)
      : null)
  if (cc === null) return null
  return Math.round(cc * 100) / 100
}

/**
 * Montant attendu pour une période donnée :
 *  - prorata du premier mois si le bail commence en cours de mois
 *    (loyer CC × jours occupés ÷ jours du mois, arrondi au centime)
 *  - loyer CC plein sinon.
 * Retourne null si le bail n'a aucun loyer connu.
 */
export function montantAttendu(bail: BailEcheancier, periode: string): number | null {
  const plein = loyerCcPlein(bail)
  if (plein === null) return null
  const [annee, mois] = parsePeriode(periode)
  if (isNaN(annee) || isNaN(mois)) return plein

  const periodeDebut = periodeDeDateIso(bail.date_debut_bail)
  if (!periodeDebut || periodeDebut !== periode) return plein

  const jourEntree = jourDeDateIso(bail.date_debut_bail)
  if (jourEntree === null || jourEntree <= 1) return plein

  const total = joursDansMois(annee, mois)
  const occupe = joursOccupes(jourEntree, annee, mois)
  return Math.round(((plein * occupe) / total) * 100) / 100
}

/**
 * Détail du prorata pour affichage : "16/30 j" — null si pas de prorata
 * (mois plein, bail sans date de début ou sans loyer).
 */
export function detailProrata(bail: BailEcheancier, periode: string): string | null {
  const periodeDebut = periodeDeDateIso(bail.date_debut_bail)
  if (!periodeDebut || periodeDebut !== periode) return null
  const jourEntree = jourDeDateIso(bail.date_debut_bail)
  if (jourEntree === null || jourEntree <= 1) return null
  const [annee, mois] = parsePeriode(periode)
  if (isNaN(annee) || isNaN(mois)) return null
  if (loyerCcPlein(bail) === null) return null
  const total = joursDansMois(annee, mois)
  return `${joursOccupes(jourEntree, annee, mois)}/${total} j`
}

/**
 * Date d'échéance du loyer pour une période : jour de paiement du bail
 * borné au dernier jour du mois (jour 31 en avril -> le 30).
 * Retourne une date ISO 'yyyy-mm-dd'.
 */
export function echeanceIso(periode: string, jourPaiement: number | null | undefined): string {
  const [annee, mois] = parsePeriode(periode)
  if (isNaN(annee) || isNaN(mois)) return periode
  const total = joursDansMois(annee, mois)
  const jour = Math.min(Math.max(Math.trunc(jourPaiement ?? 1), 1), total)
  return `${periode}-${String(jour).padStart(2, '0')}`
}

/**
 * Retard (en jours) d'un loyer non encaissé pour la période courante :
 * jours écoulés depuis l'échéance (jour de paiement). La marge ne fait que
 * DIFFÉRER le déclenchement (0 tant qu'on n'a pas dépassé échéance + marge),
 * elle n'entre pas dans le nombre de jours retourné.
 * 0 = pas encore en retard.
 */
export function joursDeRetard(
  periode: string,
  jourPaiement: number | null | undefined,
  margeJours: number,
  aujourdhui: Date = new Date()
): number {
  const iso = echeanceIso(periode, jourPaiement)
  const [a, m, j] = iso.split('-').map((x) => parseInt(x, 10))
  if (isNaN(a) || isNaN(m) || isNaN(j)) return 0
  const echeance = new Date(a, m - 1, j)
  const limite = new Date(a, m - 1, j + Math.max(0, Math.trunc(margeJours)))
  const ref = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate())
  // En retard seulement à partir de la limite ; sinon 0.
  const diff = Math.round((ref.getTime() - limite.getTime()) / 86400000)
  if (diff <= 0) return 0
  return Math.round((ref.getTime() - echeance.getTime()) / 86400000)
}
