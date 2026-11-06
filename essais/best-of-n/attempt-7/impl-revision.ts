// ============================================================================
// attempt-7 — Réimplémentation de simulerRattrapageIrl
// (CONTRAT §1a ; règles R1-R12, référence gelée au 2026-11-06)
//
// Réécrite depuis le CONTRAT, pas copiée de shared/stats.ts :
//   R1  une révision par an, à l'anniversaire du bail (même mois/jour) ;
//   R2  ratio = IRL(T_ref, y) / IRL(T_ref, y-1) ;
//   R3  trimestre de référence du bail (parse ANCRÉ /\bT([1-4])\b/), à défaut
//       trimestre du mois de début ;
//   R4  loyer arrondi au centime APRÈS CHAQUE révision jouée ;
//   R5  révisions rejouées de anneeDepart à l'année courante (borne système) ;
//       anniversaires antérieurs/égaux au début (1re année) et futurs sautés ;
//   R6  indice manquant ou indice précédent <= 0 → révision de l'année sautée ;
//   R7  map null + taux fixe non null → ratio = 1 + taux/100 chaque année ;
//   R8  loyer <= 0 ou date de début illisible → résultat à l'identique ;
//   R9  anniversaire du 29/02 borné au 28/02 les années non bissextiles ;
//   R10 borne « aujourd'hui » = date système (gel d'étude au 2026-11-06) ;
//   R11/R12 trimestre supposé fixe ; rattrapage uniquement année par année.
//
// Fonction PURE : ne dépend que de ses arguments. Aucune table IRL embarquée —
// les indices viennent exclusivement du paramètre irlParTrimestre (c'est lui
// la source selon R2/R6/R7 ; une table interne créerait une source parallèle).
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

/** Arrondi au centime le plus proche. */
function centimes(x: number): number {
  return Math.round(x * 100) / 100
}

/** Nb de jours d'un mois (gère le 29 février). */
function joursDansMois(annee: number, mois: number): number {
  return new Date(annee, mois, 0).getDate()
}

/**
 * Découpe 'yyyy-mm-dd' en composantes. Null si la forme n'est pas une date
 * ISO (mois hors 1-12 ou jour < 1 → illisible, R8). Le jour AU-DELÀ du
 * dernier du mois est BORNÉ ('2023-04-31' → 30) plutôt que laissé au
 * roulement implicite de Date() qui déporterait le bail sur le mois suivant —
 * même philosophie de bornage que P4 et R9.
 */
function decomposerIso(
  iso: string
): { annee: number; mois: number; jour: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return null
  const annee = parseInt(m[1], 10)
  const mois = parseInt(m[2], 10)
  const jour = parseInt(m[3], 10)
  if (mois < 1 || mois > 12 || jour < 1) return null
  return { annee, mois, jour: Math.min(jour, joursDansMois(annee, mois)) }
}

/** R3 : 'T3 2023' → 3 ; ' genre vide ' ou 'T2023' → null (motif ancré). */
function trimestreDeReference(s: string | null): number | null {
  const m = (s ?? '').match(/\bT([1-4])\b/)
  return m ? parseInt(m[1], 10) : null
}

/** Date ramenée à un entier comparable : aaaammjj. */
function cleDate(annee: number, mois: number, jour: number): number {
  return annee * 10000 + mois * 100 + jour
}

/**
 * Simule « et si j'avais révisé chaque année à l'anniversaire depuis
 * anneeDepart ». Indices réels INSEE via la map (clé '2024-Q3') ou taux fixe
 * annuel si la map est null. Loyer arrondi au centime à CHAQUE révision (R4).
 */
export function simulerRattrapageIrl(
  baux: BailPourSimulation[],
  anneeDepart: number,
  irlParTrimestre: Map<string, number> | null, // clé '2024-Q3'
  tauxFixeAnnuel: number | null // en %, ex 1.5 — utilisé si la map est null
): ResultatSimulationBail[] {
  const maintenant = new Date() // R5/R10 : borne système
  const anneeCourante = maintenant.getFullYear()
  const aujourdhui = cleDate(
    anneeCourante,
    maintenant.getMonth() + 1,
    maintenant.getDate()
  )

  return baux.map((bail): ResultatSimulationBail => {
    const aLIdentique: ResultatSimulationBail = {
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: bail.loyerHcActuel,
      deltaMois: 0,
      deltaAn: 0,
      revisionsJouees: 0
    }

    // R8 : loyer nul/négatif ou date de début illisible → à l'identique.
    const debut = decomposerIso(bail.dateDebutBail)
    if (debut === null || !(bail.loyerHcActuel > 0)) return aLIdentique

    // R3 : trimestre de référence du bail, sinon trimestre du mois de début.
    const trimestre =
      trimestreDeReference(bail.trimestreRef) ??
      1 + Math.floor((debut.mois - 1) / 3)

    let loyer = bail.loyerHcActuel
    let revisionsJouees = 0

    for (let annee = anneeDepart; annee <= anneeCourante; annee++) {
      // R5 : l'anniversaire de l'année de début (et des années antérieures)
      // n'est pas dû — avec un mois/jour identiques, il précède ou égale
      // toujours le début ssi annee <= debut.annee.
      if (annee <= debut.annee) continue

      // R9 : jour borné au dernier jour du mois (29/02 → 28/02).
      const jourAnniversaire = Math.min(
        debut.jour,
        joursDansMois(annee, debut.mois)
      )

      // R5 : anniversaire futur → révision pas encore due.
      if (cleDate(annee, debut.mois, jourAnniversaire) > aujourdhui) continue

      // R2/R6/R7 : ratio de l'année.
      let ratio: number | null = null
      if (irlParTrimestre !== null) {
        const precedent = irlParTrimestre.get(`${annee - 1}-Q${trimestre}`)
        const courant = irlParTrimestre.get(`${annee}-Q${trimestre}`)
        // R6 : un indice manque, ou l'indice précédent <= 0 → sautée.
        // (L'indice courant non positif est rejeté aussi : un ratio négatif
        // ou nul produirait un loyer absurde.)
        if (
          precedent !== undefined &&
          courant !== undefined &&
          precedent > 0 &&
          courant > 0
        ) {
          ratio = courant / precedent
        }
      } else if (tauxFixeAnnuel !== null) {
        ratio = 1 + tauxFixeAnnuel / 100 // R7
      }
      if (ratio === null) continue // R6 : pas de ratio → révision sautée

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
