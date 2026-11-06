// ============================================================================
// Tentative 1 — Best-of-N GestyLoc : réimplémentation de simulerRattrapageIrl
// depuis le CONTRAT (essais/best-of-n/CONTRAT.md §1a et §2, règles R1-R10).
//
// Fonction PURE : aucun import, aucune E/S, aucune dépendance npm. La borne
// « aujourd'hui » est lue de l'horloge système (R10 : non injectable dans la
// signature actuelle ; référence gelée au 2026-11-06, CONTRAT §4 — les
// résultats sont stables pendant la fenêtre de l'étude).
//
// Choix structurants (détails dans NOTES.md) :
//   - R6 appliqué à la lettre : révision sautée si l'indice précédent est
//     absent, si l'indice courant est absent, ou si l'indice précédent <= 0.
//     Un indice courant PRÉSENT (même <= 0) n'est pas couvert par la règle :
//     le ratio est calculé tel quel.
//   - R7 : le taux fixe n'intervient QUE si la map IRL est null. Une map non
//     null (même vide) prime et le taux fixe est ignoré (15 cas visibles
//     portent les deux : c'est le piège testé).
//   - La table IRL INSEE embarquée ci-dessous N'EST PAS utilisée par le
//     calcul : R2/R6 font de la map fournie en argument l'unique source
//     d'indices (une table tronquée doit produire des révisions sautées,
//     jamais un fallback silencieux sur les vraies valeurs INSEE). Elle est
//     recopiée pour référence, conformément à la consigne.
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

// ---------------------------------------------------------------------------
// Table IRL INSEE embarquée (série 001515333, base 100 T4 1998) — copie
// conforme de shared/irl-insee.ts. RÉFÉRENCE SEULEMENT : le calcul n'utilise
// que la map passée en argument (R2/R6, voir note d'en-tête).
// ---------------------------------------------------------------------------
export const IRL_INSEE: Readonly<Record<string, number>> = {
  '2004-Q1': 107.8,
  '2004-Q2': 108.28,
  '2004-Q3': 108.72,
  '2004-Q4': 109.2,
  '2005-Q1': 109.64,
  '2005-Q2': 110.08,
  '2005-Q3': 110.57,
  '2005-Q4': 111.01,
  '2006-Q1': 111.47,
  '2006-Q2': 111.98,
  '2006-Q3': 112.43,
  '2006-Q4': 112.77,
  '2007-Q1': 113.07,
  '2007-Q2': 113.37,
  '2007-Q3': 113.68,
  '2007-Q4': 114.3,
  '2008-Q1': 115.12,
  '2008-Q2': 116.07,
  '2008-Q3': 117.03,
  '2008-Q4': 117.54,
  '2009-Q1': 117.7,
  '2009-Q2': 117.59,
  '2009-Q3': 117.41,
  '2009-Q4': 117.47,
  '2010-Q1': 117.81,
  '2010-Q2': 118.26,
  '2010-Q3': 118.7,
  '2010-Q4': 119.17,
  '2011-Q1': 119.69,
  '2011-Q2': 120.31,
  '2011-Q3': 120.95,
  '2011-Q4': 121.68,
  '2012-Q1': 122.37,
  '2012-Q2': 122.96,
  '2012-Q3': 123.55,
  '2012-Q4': 123.97,
  '2013-Q1': 124.25,
  '2013-Q2': 124.44,
  '2013-Q3': 124.66,
  '2013-Q4': 124.83,
  '2014-Q1': 125.0,
  '2014-Q2': 125.15,
  '2014-Q3': 125.24,
  '2014-Q4': 125.29,
  '2015-Q1': 125.19,
  '2015-Q2': 125.25,
  '2015-Q3': 125.26,
  '2015-Q4': 125.28,
  '2016-Q1': 125.26,
  '2016-Q2': 125.25,
  '2016-Q3': 125.33,
  '2016-Q4': 125.5,
  '2017-Q1': 125.9,
  '2017-Q2': 126.19,
  '2017-Q3': 126.46,
  '2017-Q4': 126.82,
  '2018-Q1': 127.22,
  '2018-Q2': 127.77,
  '2018-Q3': 128.45,
  '2018-Q4': 129.03,
  '2019-Q1': 129.38,
  '2019-Q2': 129.72,
  '2019-Q3': 129.99,
  '2019-Q4': 130.26,
  '2020-Q1': 130.57,
  '2020-Q2': 130.57,
  '2020-Q3': 130.59,
  '2020-Q4': 130.52,
  '2021-Q1': 130.69,
  '2021-Q2': 131.12,
  '2021-Q3': 131.67,
  '2021-Q4': 132.62,
  '2022-Q1': 133.93,
  '2022-Q2': 135.84,
  '2022-Q3': 136.27,
  '2022-Q4': 137.26,
  '2023-Q1': 138.61,
  '2023-Q2': 140.59,
  '2023-Q3': 141.03,
  '2023-Q4': 142.06,
  '2024-Q1': 143.46,
  '2024-Q2': 145.17,
  '2024-Q3': 144.51,
  '2024-Q4': 144.64,
  '2025-Q1': 145.47,
  '2025-Q2': 146.68,
  '2025-Q3': 145.77,
  '2025-Q4': 145.78,
  '2026-Q1': 146.6,
  '2026-Q2': 148.37,
  '2026-Q3': 148.06
}

// ---------------------------------------------------------------------------
// Helpers purs
// ---------------------------------------------------------------------------

/** Arrondi au centime (R4). Même ordre d'opérations que le code de référence
 * (pas de divergence de virgule flottante gratuite). */
function arrondi2(x: number): number {
  return Math.round(x * 100) / 100
}

/** 'yyyy-mm-dd' (préfixe) -> Date LOCALE à minuit. Null si illisible (R8).
 * new Date(iso) lirait l'UTC minuit : décalage d'un jour sur les fuseaux
 * négatifs, d'où le parse par composantes. */
function parseDateIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  return isNaN(d.getTime()) ? null : d
}

/** R3 : trimestre d'indexation = trimestre de référence du bail si parsable
 * (parsing ANCRÉ : « T3 2023 » -> 3, « genre vide » -> rien), sinon le
 * trimestre de la date de début. */
function trimestreIndexation(trimestreRef: string | null, debut: Date): number {
  const match = (trimestreRef ?? '').match(/\bT([1-4])\b/)
  if (match) return parseInt(match[1], 10)
  return 1 + Math.floor(debut.getMonth() / 3)
}

/** R1 + R9 : anniversaire du bail l'année `annee`, jour borné au dernier jour
 * du mois (bail du 29/02 -> anniversaire le 28/02 hors années bissextiles). */
function anniversaire(annee: number, mois0: number, jour: number): Date {
  const dernierJour = new Date(annee, mois0 + 1, 0).getDate()
  return new Date(annee, mois0, Math.min(jour, dernierJour))
}

/** Lecture d'un indice dans la map fournie (Map Promise par le couloir ;
 * tolère aussi un objet brut, robustesse sans changement de sémantique). */
function lireIndice(source: Map<string, number>, cle: string): number | undefined {
  const v = typeof (source as { get?: unknown }).get === 'function'
    ? (source as Map<string, number>).get(cle)
    : (source as unknown as Record<string, number>)[cle]
  return typeof v === 'number' ? v : undefined
}

/** R6 + R2 : ratio IRL de l'année `y` pour le trimestre donné, ou null si la
 * révision doit être sautée (indice manquant, précédent <= 0). */
function ratioIrl(
  irl: Map<string, number>,
  trimestre: number,
  y: number
): number | null {
  const prec = lireIndice(irl, `${y - 1}-Q${trimestre}`)
  const cour = lireIndice(irl, `${y}-Q${trimestre}`)
  if (prec === undefined || cour === undefined || prec <= 0) return null
  return cour / prec
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export function simulerRattrapageIrl(
  baux: BailPourSimulation[],
  anneeDepart: number,
  irlParTrimestre: Map<string, number> | null, // clé '2024-Q3'
  tauxFixeAnnuel: number | null // en %, ex 1.5 — utilisé si la map est null
): ResultatSimulationBail[] {
  const maintenant = new Date()
  const anneeCourante = maintenant.getFullYear()

  return baux.map((bail) => {
    const identite: ResultatSimulationBail = {
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: bail.loyerHcActuel,
      deltaMois: 0,
      deltaAn: 0,
      revisionsJouees: 0
    }

    // R8 : loyer <= 0 ou date de début illisible -> résultat à l'identique.
    const debut = parseDateIso(bail.dateDebutBail)
    if (debut === null || !(bail.loyerHcActuel > 0)) return identite

    // R3 : trimestre d'indexation (référence du bail, sinon celui du début).
    const trimestre = trimestreIndexation(bail.trimestreRef, debut)
    const mois0 = debut.getMonth()
    const jour = debut.getDate()

    let loyer = bail.loyerHcActuel
    let revisionsJouees = 0

    // R5 : on rejoue chaque anniversaire de anneeDepart à l'année courante.
    // 1ʳᵉ année (anniversaire <= début) et anniversaires futurs : sautés.
    for (let y = anneeDepart; y <= anneeCourante; y++) {
      const echeance = anniversaire(y, mois0, jour)
      if (echeance <= debut) continue
      if (echeance > maintenant) continue

      // R6/R2 (map IRL) ou R7 (taux fixe si map null) ; sinon : saut.
      let ratio: number | null = null
      if (irlParTrimestre != null) {
        ratio = ratioIrl(irlParTrimestre, trimestre, y)
      } else if (tauxFixeAnnuel != null) {
        ratio = 1 + tauxFixeAnnuel / 100
      }
      if (ratio === null) continue

      // R4 : arrondi au centime à CHAQUE révision jouée.
      loyer = arrondi2(loyer * ratio)
      revisionsJouees++
    }

    const deltaMois = arrondi2(loyer - bail.loyerHcActuel)
    return {
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: arrondi2(deltaMois * 12),
      revisionsJouees
    }
  })
}
