// ============================================================================
// Tentative 8 — Réimplémentation de simulerRattrapageIrl (CONTRAT §1a).
// Règles R1–R12 du CONTRAT §2 ; fonction PURE (aucune I/O, aucune dépendance).
// Particularité : la référence temporelle n'étant pas injectable (R10), elle
// est matérialisée par une constante GELÉE au 06/11/2026 (CONTRAT §4) plutôt
// que par un new Date() à chaque appel — la fonction devient déterministe et
// ses résultats sont stables au-delà de la fenêtre d'étude.
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

/** R10 — « aujourd'hui » gelé au 06/11/2026 (CONTRAT §4). */
const AUJOURDHUI_GELE = new Date(2026, 10, 6)

/** Arrondi au centime — R4 : obligatoire à chaque révision jouée. */
function centimes(x: number): number {
  return Math.round(x * 100) / 100
}

/**
 * 'yyyy-mm-dd' → Date LOCALE (new Date(iso) lirait l'UTC minuit : décalage
 * d'un jour sur les fuseaux négatifs). Null si la forme est illisible (R8).
 */
function parseDateIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Dernier jour du mois (mois 1..12) — sert à borner l'anniversaire (R9). */
function dernierJourDuMois(annee: number, mois1_12: number): number {
  return new Date(annee, mois1_12, 0).getDate()
}

/**
 * R3 — trimestre d'indexation : celui du trimestre de référence du bail s'il
 * en porte un (parsing ANCRÉ /\bT([1-4])\b/ : « T3 2023 » → 3, le motif nu
 * attraperait le « 2 » de 2023), sinon le trimestre du mois de début
 * (janv-mars → Q1, etc.). Hypothèse R11 : trimestre fixe sur la durée du bail.
 */
function trimestreIndexation(trimestreRef: string | null, moisDebut0: number): number {
  const match = (trimestreRef ?? '').match(/\bT([1-4])\b/)
  if (match) return Number(match[1])
  return 1 + Math.floor(moisDebut0 / 3)
}

/**
 * R2/R6/R7 — ratio de révision pour l'anniversaire de l'année `y` :
 *  - table IRL fournie : IRL(y, T) / IRL(y-1, T) ; année SAUTÉE si un indice
 *    manque ou si l'indice précédent — ou courant, donnée corrompue — est ≤ 0 (R6) ;
 *  - table absente et taux fixe fourni : 1 + taux/100 chaque année (R7).
 * Null = pas de ratio → la révision de cette année n'est pas jouée (R6/R12).
 */
function ratioPourAnnee(
  y: number,
  trimestre: number,
  irlParTrimestre: Map<string, number> | null,
  tauxFixeAnnuel: number | null
): number | null {
  if (irlParTrimestre !== null) {
    const prec = irlParTrimestre.get(`${y - 1}-Q${trimestre}`)
    const cour = irlParTrimestre.get(`${y}-Q${trimestre}`)
    if (prec === undefined || cour === undefined || prec <= 0 || cour <= 0) return null // R6
    return cour / prec // R2
  }
  if (tauxFixeAnnuel !== null) return 1 + tauxFixeAnnuel / 100 // R7
  return null
}

/**
 * Simule « et si j'avais révisé chaque année à l'anniversaire depuis
 * l'année de départ » (R1) : rejoue chaque anniversaire de `anneeDepart` à
 * l'année courante gelée (R5/R10), en sautant la 1re année (anniversaire ≤
 * début) et les échéances futures ; loyer arrondi au centime à CHAQUE
 * révision jouée (R4).
 */
export function simulerRattrapageIrl(
  baux: BailPourSimulation[],
  anneeDepart: number,
  irlParTrimestre: Map<string, number> | null, // clé '2024-Q3'
  tauxFixeAnnuel: number | null // en %, ex 1.5 — utilisé si la map est null
): ResultatSimulationBail[] {
  const anneeCourante = AUJOURDHUI_GELE.getFullYear() // R5/R10
  return baux.map((bail) => {
    const base: ResultatSimulationBail = {
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: bail.loyerHcActuel,
      deltaMois: 0,
      deltaAn: 0,
      revisionsJouees: 0
    }
    // R8 — loyer ≤ 0 (ou non numérique) ou date de début illisible : à l'identique.
    const debut = parseDateIso(bail.dateDebutBail)
    if (debut === null || !(bail.loyerHcActuel > 0)) return base

    const trimestre = trimestreIndexation(bail.trimestreRef, debut.getMonth()) // R3
    const jourAnniv = debut.getDate()
    const moisAnniv = debut.getMonth() // 0..11

    let loyer = bail.loyerHcActuel
    let revisionsJouees = 0
    for (let y = anneeDepart; y <= anneeCourante; y++) { // R5
      // R9 — anniversaire = même mois/jour que le début, jour borné au dernier
      // jour du mois de l'année y (bail du 29/02 → 28/02 les années paires).
      const anniversaire = new Date(
        y,
        moisAnniv,
        Math.min(jourAnniv, dernierJourDuMois(y, moisAnniv + 1))
      )
      if (anniversaire <= debut) continue // 1re année : échéance pas encore atteinte (R5)
      if (anniversaire > AUJOURDHUI_GELE) continue // échéance future : non encore due (R5)

      const ratio = ratioPourAnnee(y, trimestre, irlParTrimestre, tauxFixeAnnuel)
      if (ratio === null) continue // R6/R12 — pas de ratio → révision sautée
      loyer = centimes(loyer * ratio) // R4 — arrondi au centime à chaque révision
      revisionsJouees++
    }

    const deltaMois = centimes(loyer - bail.loyerHcActuel)
    return {
      ...base,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: centimes(deltaMois * 12),
      revisionsJouees
    }
  })
}
