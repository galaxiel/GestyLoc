// ============================================================================
// Best-of-N — attempt-2 — impl-revision.ts
// Réimplémentation de simulerRattrapageIrl depuis le CONTRAT (§1a, règles
// R1 à R12). Fonction PURE : aucun import, aucune E/S, aucune dépendance.
//
// Choix d'implémentation :
//  - l'indice vient UNIQUEMENT de l'argument `irlParTrimestre` (R2/R6 : les
//    cas fournissent des tables tronquées ou modifiées, c'est la source
//    autoritative ; aucune table IRL n'est embarquée) ;
//  - l'indice est lu dans une Map OU un objet plat (robustesse de
//    sérialisation, cf. CONTRAT §1a « Sérialisation des cas ») ;
//  - la date de début est analysée en ancré puis portée en Date LOCALE
//    (jamais `new Date(iso)`, qui lirait l'UTC minuit) ;
//  - les jours des mois viennent d'une table + arithmétique bissextile,
//    pas de `new Date(y, m+1, 0)`.
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

/** R3 — parsing ANCRÉ du trimestre de référence : « T3 2023 » → 3.
 * Les frontières de mot (\b) empêchent d'attraper le « 3 » de 2023 ou un
 * hypothétique « T12 ». Aucune correspondance → trimestre du mois de début. */
const RE_TRIMESTRE_REF = /\bT([1-4])\b/

const JOURS_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Année bissextile grégorienne (R9). */
function bissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
}

/** Nb de jours d'un mois 1-12 (29/02 géré, R9). */
function joursDansMois(annee: number, mois1_12: number): number {
  if (mois1_12 === 2) return bissextile(annee) ? 29 : 28
  return JOURS_MOIS[mois1_12 - 1] ?? 31
}

/** Arrondi au centime (R4 : à CHAQUE révision jouée ; R5 : deltas). */
function centimes(x: number): number {
  return Math.round(x * 100) / 100
}

/** 'yyyy-mm-dd' → Date locale (null si illisible, R8).
 * Analyse ancrée 4-2-2 chiffres ; les composantes portées en constructeur
 * local évitent le décalage UTC de `new Date(iso)`. */
function parserDateLocale(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s))
  if (!m) return null
  const d = new Date(
    parseInt(m[1] ?? '', 10),
    parseInt(m[2] ?? '', 10) - 1,
    parseInt(m[3] ?? '', 10)
  )
  return Number.isNaN(d.getTime()) ? null : d
}

/** Lecture d'un indice dans une Map ou un objet plat ; undefined si absent. */
function indice(table: unknown, cle: string): number | undefined {
  if (table === null || table === undefined) return undefined
  if (typeof (table as Map<string, number>).get === 'function') {
    return (table as Map<string, number>).get(cle)
  }
  return (table as Record<string, number | undefined>)[cle]
}

/** Ratio de révision pour l'année `y` et le trimestre `t` (R2, R6, R7).
 * Null = révision sautée cette année-là.
 *  - table fournie : ratio = IRL(y, t) / IRL(y−1, t) ; un indice manquant ou
 *    non exploitable (≤ 0, traité comme manquant : un indice nul/négatif
 *    n'existe pas à l'INSEE) → pas de ratio (R6) ;
 *  - table absente + taux fixe fourni : ratio = 1 + taux/100 (R7). */
function ratioRevision(
  y: number,
  trimestre: number,
  irlParTrimestre: Map<string, number> | null,
  tauxFixeAnnuel: number | null
): number | null {
  if (irlParTrimestre) {
    const prec = indice(irlParTrimestre, `${y - 1}-Q${trimestre}`)
    const cour = indice(irlParTrimestre, `${y}-Q${trimestre}`)
    if (prec === undefined || cour === undefined) return null
    if (!(prec > 0) || !(cour > 0)) return null
    return cour / prec
  }
  if (tauxFixeAnnuel !== null && tauxFixeAnnuel !== undefined) {
    return 1 + tauxFixeAnnuel / 100
  }
  return null
}

/** Anniversaire de l'année `y` (R1, R9) : même mois/jour que le début, le
 * jour étant borné au dernier jour du mois (un bail du 29/02 fête son
 * anniversaire le 28/02 les années non bissextiles). */
function anniversaire(y: number, mois1_12: number, jour: number): Date {
  const jourBorne = Math.min(jour, joursDansMois(y, mois1_12))
  return new Date(y, mois1_12 - 1, jourBorne)
}

/**
 * Simule « et si j'avais révisé chaque année à l'anniversaire depuis l'année
 * de départ » (R1/R5), avec les indices IRL fournis (R2/R6) ou un taux fixe
 * (R7). Loyer arrondi au centime à chaque révision jouée (R4).
 */
export function simulerRattrapageIrl(
  baux: BailPourSimulation[],
  anneeDepart: number,
  irlParTrimestre: Map<string, number> | null, // clé '2024-Q3'
  tauxFixeAnnuel: number | null // en %, ex 1.5 — utilisé si la map est null
): ResultatSimulationBail[] {
  // R5/R10 : borne « aujourd'hui » — date système, gelée au 2026-11-06 pour
  // l'étude (CONTRAT §4). Capturée une fois pour toute l'exécution.
  const maintenant = new Date()
  const anneeCourante = maintenant.getFullYear()

  return baux.map((bail): ResultatSimulationBail => {
    // R8 : loyer non positif ou date de début illisible → résultat à
    // l'identique, 0 révision.
    const debut = parserDateLocale(bail.dateDebutBail)
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

    // R3 : trimestre d'indexation = trimestre de référence du bail s'il est
    // lisible (parsing ancré), sinon trimestre du mois de début.
    let trimestre = Math.floor(debut.getMonth() / 3) + 1
    const matchRef = (bail.trimestreRef ?? '').match(RE_TRIMESTRE_REF)
    if (matchRef) trimestre = parseInt(matchRef[1] ?? '', 10)

    // R1/R5 : chaque anniversaire de anneeDepart à l'année courante ;
    // anniversaires ≤ début (1re année) et futurs sautés.
    let loyer = bail.loyerHcActuel
    let revisionsJouees = 0
    for (let y = anneeDepart; y <= anneeCourante; y++) {
      const echeance = anniversaire(y, debut.getMonth() + 1, debut.getDate())
      if (echeance.getTime() <= debut.getTime()) continue // 1re année
      if (echeance.getTime() > maintenant.getTime()) continue // future, non due
      const ratio = ratioRevision(y, trimestre, irlParTrimestre, tauxFixeAnnuel)
      if (ratio === null) continue // R6/R7 : pas de ratio cette année
      loyer = centimes(loyer * ratio) // R4
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
