// ============================================================================
// ORACLE du contrat — implémentation de référence écrite indépendamment,
// directement depuis les règles R1-R12 et P1-P7 de CONTRAT.md.
// Rôle : arbitre du jugement. Ce n'est PAS une 9e tentative (elle ne participe
// pas au vote) — elle tranche les divergences en appliquant les règles citées.
// JS pur, sans dépendance, sans lecture de fichier (fonctions pures).
// ============================================================================

// --- Révision IRL (R1-R12) ---------------------------------------------------
const REF_ANNEE = 2026
const REF_MOIS = 10 // novembre = index 10
const REF_JOUR = 6
// Référence temporelle gelée : 2026-11-06 (CONTRAT §4)

const round2 = (v) => Math.round(v * 100) / 100

export function simulerRevisionContrat({ bail, anneeDepart, irl, tauxFixe }) {
  const loyerActuel = bail.loyerHcActuel
  const [a, m, j] = bail.dateDebutBail.split('-').map(Number)
  const debut = new Date(a, m - 1, j)
  if (isNaN(debut.getTime()) || loyerActuel <= 0) {
    return { loyerSimule: loyerActuel, revisionsJouees: 0, deltaMois: 0, deltaAn: 0 }
  }
  // R3 : trimestre ancré, sinon trimestre du mois de début
  const match = (bail.trimestreRef ?? '').match(/\bT([1-4])\b/)
  const trimestre = match ? parseInt(match[1], 10) : 1 + Math.floor(debut.getMonth() / 3)
  let loyer = loyerActuel
  let revisions = 0
  // R5 : replai de anneeDepart à l'année de la référence gelée (2026)
  for (let y = anneeDepart; y <= REF_ANNEE; y++) {
    const dernierJour = new Date(y, debut.getMonth() + 1, 0).getDate()
    // R9 : anniversaire 29/02 borné au 28/02 les années non bissextiles
    const anniversaire = new Date(y, debut.getMonth(), Math.min(debut.getDate(), dernierJour))
    if (anniversaire <= debut) continue // 1re année
    // R5 : anniversaire futur (vs référence gelée) → non joué
    if (anniversaire > new Date(REF_ANNEE, REF_MOIS, REF_JOUR)) continue
    let ratio = null
    if (irl) {
      // R6 : les deux indices doivent exister et le précédent > 0
      const prec = irl.get(`${y - 1}-Q${trimestre}`)
      const cour = irl.get(`${y}-Q${trimestre}`)
      if (prec !== undefined && cour !== undefined && prec > 0) ratio = cour / prec
    } else if (tauxFixe !== null && tauxFixe !== undefined) {
      ratio = 1 + tauxFixe / 100
    }
    if (ratio === null) continue // R6 : révision sautée
    loyer = round2(loyer * ratio) // R4 : arrondi au centime à chaque révision
    revisions++
  }
  return {
    loyerSimule: loyer,
    revisionsJouees: revisions,
    deltaMois: round2(loyer - loyerActuel),
    deltaAn: round2((loyer - loyerActuel) * 12)
  }
}

// --- Prorata (P1-P7) ---------------------------------------------------------
export function montantAttenduContrat({ bail, periode }) {
  // P1 : plein = loyer_cc, sinon HC + charges si l'un est renseigné, sinon null
  let plein = bail.loyer_cc
  if (plein === null || plein === undefined) {
    if (bail.loyer_hc !== null && bail.loyer_hc !== undefined) plein = (bail.loyer_hc ?? 0) + (bail.charges ?? 0)
    else if (bail.charges !== null && bail.charges !== undefined) plein = 0 + bail.charges
    else plein = null
  }
  if (plein === null || plein === undefined) return null
  plein = round2(plein)
  const [a, m] = periode.split('-').map(Number)
  if (isNaN(a) || isNaN(m)) return plein
  // P2 : prorata uniquement sur le premier mois du bail
  const debut = bail.date_debut_bail
  if (!debut) return plein
  const mm = /^(\d{4})-(\d{2})/.exec(debut)
  if (!mm || `${mm[1]}-${mm[2]}` !== periode) return plein
  const jd = /^(\d{4})-(\d{2})-(\d{2})/.exec(debut)
  if (!jd) return plein
  const jour = parseInt(jd[3], 10)
  if (jour <= 1) return plein // P5
  // P4 : jour borné au dernier jour du mois
  const total = new Date(a, m, 0).getDate()
  const j = Math.min(Math.max(Math.trunc(jour), 1), total)
  // P3 : jours civils, jour d'entrée compris
  const occupes = total - j + 1
  return round2((plein * occupes) / total)
  // P6 : la date de fin est IGNORÉE (mois de sortie dû entier) — règle du code actuel
}
