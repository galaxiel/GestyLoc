// ============================================================================
// Tentative 3 — réimplémentation de simulerRattrapageIrl (CONTRAT §1a, R1-R12).
//
// Fonction PURE : ne dépend QUE de ses arguments.
// Choix marquants vis-à-vis du code actuel (shared/stats.ts) :
//  1. Borne temporelle GELÉE au 2026-11-06 (R10/§4) au lieu de `new Date()` :
//     identique dans la fenêtre d'exécution de l'étude, mais déterministe
//     pour toujours — et l'implémentation ne lit plus l'horloge système.
//  2. AUCUNE table IRL embarquée : l'indice vient exclusivement de la map
//     passée en argument (R2). Un trimestre absent de la map DOIT sauter la
//     révision (R6) — une table de secours ferait diverger tous les cas
//     « indices manquants / tables tronquées ».
//  3. Date de début refusée si elle n'existe pas (ex. 2025-04-31) : R8 dit
//     « date illisible → résultat à l'identique » ; une date inexistante ne
//     définit pas d'anniversaire. Le code actuel la fait rouler au mois
//     suivant (new Date(2025, 3, 31) → 01/05) — divergence volontaire,
//     invisible sur le générateur (aucune date impossible en révision).
// ============================================================================

export interface BailPourSimulation {
  bailId: number
  designation: string
  locataire: string
  loyerHcActuel: number
  dateDebutBail: string // 'yyyy-mm-dd'
  trimestreRef: string | null // 'T3 2023'
}

export interface ResultatSimulationBail {
  bailId: number
  designation: string
  locataire: string
  loyerActuel: number
  loyerSimule: number
  deltaMois: number
  deltaAn: number
  revisionsJouees: number
}

/** Borne « aujourd'hui » gelée par le contrat (§4, R10) : 6 novembre 2026. */
const AUJOURDHUI = new Date(2026, 10, 6)
const ANNEE_REFERENCE = AUJOURDHUI.getFullYear()

/** Arrondi au centime (R4 : obligatoire à CHAQUE révision jouée). */
function centimes(x: number): number {
  return Math.round(x * 100) / 100
}

/** 'yyyy-mm-dd' -> date locale à minuit ; null si illisible ou inexistante (R8). */
function dateIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '')
  if (!m) return null
  const annee = parseInt(m[1], 10)
  const mois = parseInt(m[2], 10) - 1
  const jour = parseInt(m[3], 10)
  const d = new Date(annee, mois, jour)
  // Refus des dates inexistantes (30/02…) que Date ferait « rouler » : si les
  // composantes ne retombent pas pile, la chaîne ne désigne aucune date.
  if (isNaN(d.getTime()) || d.getFullYear() !== annee || d.getMonth() !== mois || d.getDate() !== jour) {
    return null
  }
  return d
}

/** Dernier jour du mois (1-12) de l'année y — 29/02 les années bissextiles. */
function dernierJourDuMois(y: number, mois0: number): number {
  return new Date(y, mois0 + 1, 0).getDate()
}

/**
 * Simule « et si j'avais révisé chaque année à l'anniversaire depuis l'année
 * de départ » (R1/R5) avec le ratio IRL du trimestre de référence (R2/R3) ou
 * un taux fixe annuel (R7). Loyer arrondi au centime à chaque révision (R4).
 */
export function simulerRattrapageIrl(
  baux: BailPourSimulation[],
  anneeDepart: number,
  irlParTrimestre: Map<string, number> | null, // clé '2024-Q3'
  tauxFixeAnnuel: number | null // en %, ex 1.5 — utilisé si la map est null
): ResultatSimulationBail[] {
  return baux.map((bail) => {
    const debut = dateIso(bail.dateDebutBail)
    // R8 : loyer non positif (0, négatif) ou date de début illisible → identique.
    if (debut === null || !(bail.loyerHcActuel > 0)) {
      return {
        bailId: bail.bailId,
        designation: bail.designation,
        locataire: bail.locataire,
        loyerActuel: bail.loyerHcActuel,
        loyerSimule: bail.loyerHcActuel,
        deltaMois: 0,
        deltaAn: 0,
        revisionsJouees: 0
      }
    }

    // R3 : trimestre d'indexation = trimestre de référence du bail si lisible
    // (parsing ancré : 'T3 2023' → 3, 'T12' / ' genre vide ' → ignorés),
    // sinon le trimestre de la date de début.
    let trimestre = 1 + Math.floor(debut.getMonth() / 3)
    const ref = /\bT([1-4])\b/.exec(bail.trimestreRef ?? '')
    if (ref) trimestre = parseInt(ref[1], 10)

    let loyer = bail.loyerHcActuel
    let revisionsJouees = 0

    // R5 : on rejoue chaque anniversaire de anneeDepart à l'année de la borne
    // gelée ; 1re année (anniversaire ≤ début) et échéances futures sautées.
    for (let y = anneeDepart; y <= ANNEE_REFERENCE; y++) {
      // R9 : anniversaire du 29/02 borné au 28/02 les années non bissextiles.
      const jour = Math.min(debut.getDate(), dernierJourDuMois(y, debut.getMonth()))
      const anniversaire = new Date(y, debut.getMonth(), jour)
      if (anniversaire <= debut) continue // 1re année : pas encore d'échéance
      if (anniversaire > AUJOURDHUI) continue // future : non encore due

      // R2/R6/R7 : ratio de l'année, ou null → révision sautée.
      let ratio: number | null = null
      if (irlParTrimestre) {
        const prec = irlParTrimestre.get(`${y - 1}-Q${trimestre}`)
        const cour = irlParTrimestre.get(`${y}-Q${trimestre}`)
        if (prec !== undefined && cour !== undefined && prec > 0 && cour > 0) {
          ratio = cour / prec
        }
      } else if (tauxFixeAnnuel !== null) {
        ratio = 1 + tauxFixeAnnuel / 100
      }
      if (ratio === null) continue // R6 : indice absent ou invalide → sautée

      loyer = centimes(loyer * ratio) // R4 : arrondi à chaque révision
      revisionsJouees++
    }

    const deltaMois = centimes(loyer - bail.loyerHcActuel)
    return {
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: centimes(deltaMois * 12),
      revisionsJouees
    }
  })
}
