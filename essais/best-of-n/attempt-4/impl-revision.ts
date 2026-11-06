// ============================================================================
// Attempt 4 — simulerRattrapageIrl, réimplémenté depuis le CONTRAT §2 (R1-R12).
//
// Modèle : on rejoue chaque anniversaire (même mois/jour que la date de début,
// R1) de anneeDepart à l'année courante (R5, borne système — R10 : date non
// injectable, on lit `new Date()`), et on applique le ratio d'indices du
// trimestre de référence (R2/R3). Arrondi au centime À CHAQUE révision jouée
// (R4) — l'ordre des opérations d'arrondi est conservé tel quel : c'est la
// règle sourcée, et elle fixe le comportement sur les demi-centimes flottants.
//
// Écarts assumés vis-à-vis du code actuel (hors règles) :
//   - indices lus via un accesseur tolérant (Map du contrat §1a, ou objet brut
//     si l'appelant n'a pas converti) ;
//   - un indice COURANT ≤ 0 saute aussi la révision (R6 ne cite que le
//     précédent ; un indice négatif ou nul ne peut pas fonder un ratio) ;
//   - loyer non fini (NaN) traité comme « illisible » (R8, résultat identique).
// Fonction PURE : ne dépend que de ses arguments (et de l'horloge, R10).
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

/** Arrondi au centime (R4) — même expression que la règle sourcée. */
const centimes = (x: number): number => Math.round(x * 100) / 100

/**
 * 'yyyy-mm-dd' (préfixe suffisant) → Date LOCALE à minuit.
 * Jamais `new Date(iso)` : il lirait l'UTC minuit et décalerait d'un jour
 * sur les fuseaux négatifs. Null si illisible (R8).
 */
function dateDebut(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Lecture d'un indice : Map '2024-Q3' → valeur (contrat §1a) ou objet brut.
 * Tolérance volontaire : le couloir est censé convertir en Map, mais accepter
 * l'objet ne change rien quand une Map arrive.
 */
function indice(table: unknown, cle: string): number | undefined {
  if (!table) return undefined
  if (typeof (table as Map<string, number>).get === 'function') {
    return (table as Map<string, number>).get(cle)
  }
  return (table as Record<string, number>)[cle]
}

/**
 * R3 : trimestre d'indexation. Celui de la référence du bail si elle contient
 * un T1..T4 délimité (parse ANCRÉ : « T3 2023 » → 3, et « T3 » de l'année ne
 * fuite pas dans le motif) ; sinon le trimestre du mois de début.
 */
function trimestreIndexation(bail: BailPourSimulation, debut: Date): number {
  const match = /\bT([1-4])\b/.exec(bail.trimestreRef ?? '')
  if (match) return Number(match[1])
  return 1 + Math.floor(debut.getMonth() / 3)
}

/**
 * Simule « et si j'avais révisé à chaque anniversaire depuis anneeDepart ».
 * Indices réels INSEE (map '2024-Q3' → valeur) ou taux fixe annuel (R7).
 */
export function simulerRattrapageIrl(
  baux: BailPourSimulation[],
  anneeDepart: number,
  irlParTrimestre: Map<string, number> | null, // clé '2024-Q3'
  tauxFixeAnnuel: number | null // en %, ex 1.5 — utilisé si la map est null
): ResultatSimulationBail[] {
  const maintenant = new Date() // R10 : référence = date système (gelée §4)
  const anneeCourante = maintenant.getFullYear() // R5

  return baux.map((bail): ResultatSimulationBail => {
    const aLIdentique = (): ResultatSimulationBail => ({
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: bail.loyerHcActuel,
      deltaMois: 0,
      deltaAn: 0,
      revisionsJouees: 0
    })

    const debut = dateDebut(bail.dateDebutBail)
    // R8 : loyer ≤ 0 ou date illisible → résultat à l'identique, 0 révision.
    if (debut === null || !(bail.loyerHcActuel > 0)) return aLIdentique()

    const trimestre = trimestreIndexation(bail, debut) // R3
    let loyer = bail.loyerHcActuel
    let revisionsJouees = 0

    // R5 : chaque anniversaire de anneeDepart à l'année courante.
    for (let annee = anneeDepart; annee <= anneeCourante; annee++) {
      // R1/R9 : même mois/jour que le début ; 29/02 borné au 28 hors bissextile.
      const dernierJour = new Date(annee, debut.getMonth() + 1, 0).getDate()
      const anniversaire = new Date(annee, debut.getMonth(), Math.min(debut.getDate(), dernierJour))
      if (anniversaire.getTime() <= debut.getTime()) continue // 1ʳᵉ année : pas encore dû
      if (anniversaire.getTime() > maintenant.getTime()) continue // futur : non dû (R5)

      // R2/R6/R7 : ratio de l'année sur le trimestre de référence.
      let ratio: number | null = null
      if (irlParTrimestre) {
        const precedent = indice(irlParTrimestre, `${annee - 1}-Q${trimestre}`)
        const courant = indice(irlParTrimestre, `${annee}-Q${trimestre}`)
        if (
          precedent !== undefined &&
          courant !== undefined &&
          precedent > 0 &&
          courant > 0
        ) {
          ratio = courant / precedent
        }
      } else if (tauxFixeAnnuel !== null) {
        ratio = 1 + tauxFixeAnnuel / 100 // R7 (taux 0 → ratio 1, révision jouée)
      }
      if (ratio === null) continue // R6 : indices manquants → année sautée

      loyer = centimes(loyer * ratio) // R4 : arrondi obligatoire à chaque révision
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
