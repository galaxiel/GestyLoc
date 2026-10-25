// ============================================================================
// Statistiques segmentées — fonctions pures (testables).
// Principes (spec "Statistiques 2.0") :
//   R1 : jamais de ratio (€/m²…) sur un mélange de segments
//   R2 : l'unité suit le type de bien (€/m² logement, €/emplacement garage)
//   R3 : effectif + dispersion (médiane, quartiles) toujours affichés
// ============================================================================

/** Médiane d'une liste (attention : n < 3 = anecdote, pas statistique). */
export function mediane(valeurs: number[]): number | null {
  const v = valeurs.filter((x) => !isNaN(x)).sort((a, b) => a - b)
  const n = v.length
  if (n === 0) return null
  if (n % 2 === 1) return v[(n - 1) / 2]
  return (v[n / 2 - 1] + v[n / 2]) / 2
}

/** Quartiles (méthode médiane des moitiés, suffisant sur de petits effectifs). */
export function quartiles(valeurs: number[]): { q1: number | null; med: number | null; q3: number | null } {
  const v = valeurs.filter((x) => !isNaN(x)).sort((a, b) => a - b)
  const n = v.length
  if (n === 0) return { q1: null, med: null, q3: null }
  const moitie = Math.floor(n / 2)
  const inferieure = n % 2 === 0 ? v.slice(0, moitie) : v.slice(0, moitie)
  const superieure = n % 2 === 0 ? v.slice(moitie) : v.slice(moitie + 1)
  return { q1: mediane(inferieure), med: mediane(v), q3: mediane(superieure) }
}

/** L'unité de référence suit le type de bien (R2). */
export function uniteReference(typeBien: string): 'm2' | 'emplacement' {
  return typeBien === 'Garage' || typeBien === 'Parking' ? 'emplacement' : 'm2'
}

export interface BienPourRatio {
  designation: string
  locataire: string
  type_bien: string
  meuble: boolean
  surface_m2: number | null
  valeur_venale: number | null
  // Base de ratio : loyer CC pour l'occupation payante
  baseMensuelle: number | null
  bailId: number
}

export interface Segment {
  type: string
  unite: 'm2' | 'emplacement'
  n: number
  loyersCc: number
  surface: number
  ratios: { designation: string; locataire: string; bailId: number; valeur: number; base: number }[]
  med: number | null
  q1: number | null
  q3: number | null
  rendementBrut: number | null // % si valeurs vénales renseignées
}

/** Découpe le parc en segments par type de bien, avec ratios par bien (R1). */
export function segmentsParType(biens: BienPourRatio[]): Segment[] {
  const map = new Map<string, BienPourRatio[]>()
  for (const b of biens) {
    if (!map.has(b.type_bien)) map.set(b.type_bien, [])
    map.get(b.type_bien)!.push(b)
  }
  const segments: Segment[] = []
  for (const [type, liste] of map) {
    const unite = uniteReference(type)
    const ratios = liste
      .map((b) => {
        const denom = unite === 'm2' ? (b.surface_m2 ?? 0) : 1
        const valeur = denom > 0 && b.baseMensuelle !== null ? Math.round((b.baseMensuelle / denom) * 100) / 100 : 0
        return { designation: b.designation, locataire: b.locataire, bailId: b.bailId, valeur, base: b.baseMensuelle ?? 0 }
      })
      .sort((a, b) => b.valeur - a.valeur)
    const qs = quartiles(ratios.map((r) => r.valeur))
    const loyersCc = Math.round(liste.reduce((s, b) => s + (b.baseMensuelle ?? 0), 0) * 100) / 100
    const surface = Math.round(liste.reduce((s, b) => s + (b.surface_m2 ?? 0), 0) * 100) / 100
    const valeurVenale = liste.reduce((s, b) => s + (b.valeur_venale ?? 0), 0)
    const loyersHcAnnuel = liste.reduce((s, b) => s + (b.baseMensuelle ?? 0), 0) * 12 // approximation CC ; le rendement brut reste indicatif
    segments.push({
      type,
      unite,
      n: liste.length,
      loyersCc,
      surface,
      ratios,
      med: qs.med,
      q1: qs.q1,
      q3: qs.q3,
      rendementBrut:
        valeurVenale > 0 ? Math.round((loyersHcAnnuel / valeurVenale) * 10000) / 100 : null
    })
  }
  return segments.sort((a, b) => b.loyersCc - a.loyersCc)
}

export interface Suspect {
  designation: string
  locataire: string
  bailId: number
  typeBien: string
  valeur: number
  medianeSegment: number
  ecartPct: number // négatif = sous la médiane
  manqueAGagnerAnnuel: number
}

/** Biens sous la médiane de leur segment de plus de 15 % — liste des suspects. */
export function suspects(sgs: Segment[], seuilPct = 15): Suspect[] {
  const out: Suspect[] = []
  for (const seg of sgs) {
    if (seg.med === null || seg.n < 3) continue // R3 : trop peu de biens
    for (const r of seg.ratios) {
      const ecart = Math.round(((r.valeur / seg.med - 1) * 100) * 100) / 100
      if (ecart <= -seuilPct) {
        out.push({
          designation: r.designation,
          locataire: r.locataire,
          bailId: r.bailId,
          typeBien: seg.type,
          valeur: r.valeur,
          medianeSegment: seg.med,
          ecartPct: ecart,
          manqueAGagnerAnnuel: Math.round((seg.med - r.valeur) * 12 * 100) / 100
        })
      }
    }
  }
  return out.sort((a, b) => b.manqueAGagnerAnnuel - a.manqueAGagnerAnnuel)
}

// ============================================================================
// Simulateur — modèle A : rattrapage IRL (scénario PUR, aucune écriture)
// ============================================================================

export interface BailPourSimulation {
  bailId: number
  designation: string
  locataire: string
  loyerHcActuel: number
  dateDebutBail: string // yyyy-mm-dd
  trimestreRef: string | null // "T3 2023" — pilote le trimestre d'indexation
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

/**
 * Simule « et si j'avais révisé chaque année à l'anniversaire depuis l'année de
 * départ ». IRL = valeurs réelles INSEE (map "Q" -> { [trimestre]: valeur }) ou
 * taux fixe annuel. Loyer arrondi au centime à CHAQUE révision (règle légale).
 */
export function simulerRattrapageIrl(
  baux: BailPourSimulation[],
  anneeDepart: number,
  irlParTrimestre: Map<string, number> | null, // clé "2024-Q3"
  tauxFixeAnnuel: number | null // en %, ex 1.5 — utilisé si la map est null
): ResultatSimulationBail[] {
  const anneeCourante = new Date().getFullYear()
  return baux.map((b) => {
    const debut = new Date(b.dateDebutBail)
    if (isNaN(debut.getTime()) || b.loyerHcActuel <= 0) {
      return {
        bailId: b.bailId,
        designation: b.designation,
        locataire: b.locataire,
        loyerActuel: b.loyerHcActuel,
        loyerSimule: b.loyerHcActuel,
        deltaMois: 0,
        deltaAn: 0,
        revisionsJouees: 0
      }
    }
    // Trimestre d'indexation : celui de référence du bail, sinon celui de l'anniversaire.
    let trimestre = 1 + Math.floor(debut.getMonth() / 3)
    const matchRef = (b.trimestreRef ?? '').match(/[1234]/)
    if (matchRef) trimestre = parseInt(matchRef[0], 10)

    let loyer = b.loyerHcActuel
    let revisions = 0
    // On rejoue chaque anniversaire de l'année de départ à l'année courante.
    // Anniversaire = même mois/jour que le début du bail.
    for (let y = anneeDepart; y <= anneeCourante; y++) {
      const anniversaire = new Date(y, debut.getMonth(), debut.getDate())
      if (anniversaire <= debut) continue // première année : pas encore d'échéance
      if (anniversaire > new Date()) continue // échéance future : pas jouée
      let ratio: number | null = null
      if (irlParTrimestre) {
        const prec = irlParTrimestre.get(`${y - 1}-Q${trimestre}`)
        const cour = irlParTrimestre.get(`${y}-Q${trimestre}`)
        if (prec && cour && prec > 0) ratio = cour / prec
      } else if (tauxFixeAnnuel !== null) {
        ratio = 1 + tauxFixeAnnuel / 100
      }
      if (ratio === null) continue
      loyer = Math.round(loyer * ratio * 100) / 100 // arrondi au centime, obligatoire
      revisions++
    }
    const deltaMois = Math.round((loyer - b.loyerHcActuel) * 100) / 100
    return {
      bailId: b.bailId,
      designation: b.designation,
      locataire: b.locataire,
      loyerActuel: b.loyerHcActuel,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: Math.round(deltaMois * 12 * 100) / 100,
      revisionsJouees: revisions
    }
  })
}
