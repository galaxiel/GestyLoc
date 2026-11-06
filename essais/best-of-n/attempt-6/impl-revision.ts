// ============================================================================
// Best-of-N — attempt 6 — impl-revision.ts
// Réimplémentation de simulerRattrapageIrl depuis le CONTRAT (§1a, règles
// R1-R12). Fonction PURE : aucune dépendance, aucune E/S.
//
// Choix structurant : l'indice IRL vient EXCLUSIVEMENT de la map passée en
// argument (R2/R6/R7 ne connaissent que cette source). Aucune table IRL
// embarquée : les cas du jeu portent leurs propres valeurs, parfois
// volontairement différentes de la table publique — une table de secours
// contredirait R6 (« indice manquant -> révision sautée »).
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

// R10 + CONTRAT §4 : la borne temporelle n'est pas injectable dans la
// signature actuelle ; pour l'étude elle est GELÉE au 2026-11-06 (locale,
// minuit). Gelée en constante plutôt que lue via new Date() : comportement
// identique dans la fenêtre d'exécution (le générateur garantit qu'aucun
// anniversaire ne tombe entre le 06/11 et le 30/11/2026) et reproductible
// au bit près à toute date d'exécution.
const REFERENCE_TEMPORELLE = new Date(2026, 10, 6)

/** R4 : arrondi au centime. */
const centimes = (x: number): number => Math.round(x * 100) / 100

/**
 * 'yyyy-mm-dd' -> {annee, mois0, jour} en date LOCALE. Null si illisible (R8).
 * Parsing ANCRÉ complet (les formats non 'yyyy-mm-dd' sont illisibles) ;
 * mois validé 01-12 ; le jour est BORNÉ au dernier jour du mois (esprit R9 :
 * « 31 avril » -> 30, « 29/02 non bissextile » -> 28) plutôt que reporté au
 * mois suivant comme le ferait un Date brut.
 */
function parseDebutIso(s: string): { annee: number; mois0: number; jour: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const annee = parseInt(m[1], 10)
  const mois0 = parseInt(m[2], 10) - 1
  if (mois0 < 0 || mois0 > 11) return null
  const dernierJour = new Date(annee, mois0 + 1, 0).getDate()
  return { annee, mois0, jour: Math.min(Math.max(parseInt(m[3], 10), 1), dernierJour) }
}

/** R8 : résultat à l'identique, 0 révision. */
function resultatIdentique(b: BailPourSimulation): ResultatSimulationBail {
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

export function simulerRattrapageIrl(
  baux: BailPourSimulation[],
  anneeDepart: number,
  irlParTrimestre: Map<string, number> | null, // clé '2024-Q3'
  tauxFixeAnnuel: number | null // en %, ex 1.5 — utilisé si la map est null
): ResultatSimulationBail[] {
  const anneeCourante = REFERENCE_TEMPORELLE.getFullYear() // R5/R10
  return baux.map((b) => {
    // R8 : loyer non positif (0 = parking gratuit valide, NaN = illisible)
    // ou date de début illisible -> à l'identique, 0 révision.
    if (!(b.loyerHcActuel > 0)) return resultatIdentique(b)
    const debut = parseDebutIso(b.dateDebutBail)
    if (debut === null) return resultatIdentique(b)

    // R3 : trimestre d'indexation = trimestre de référence du bail (parsing
    // ANCRÉ /\bT([1-4])\b/ : « T3 2023 » -> 3, pas le « 2 » de « 2023 ») ;
    // à défaut, le trimestre de la date de début. Fixe sur tout le bail (R11).
    let trimestre = 1 + Math.floor(debut.mois0 / 3)
    const matchRef = (b.trimestreRef ?? '').match(/\bT([1-4])\b/)
    if (matchRef) trimestre = parseInt(matchRef[1], 10)

    // R1 : anniversaire = même mois/jour que la date de début. Le jour étant
    // déjà borné au dernier du mois, R9 est couvert (29/02 -> 28/02).
    const debutDate = new Date(debut.annee, debut.mois0, debut.jour)

    let loyer = b.loyerHcActuel
    let revisions = 0
    // R5 : rejeu de anneeDepart à l'année courante (gelée) ; anniversaires
    // antérieurs ou égaux au début sautés (1re année) ; futurs sautés (non
    // encore dus).
    for (let y = anneeDepart; y <= anneeCourante; y++) {
      const anniversaire = new Date(y, debut.mois0, debut.jour)
      if (anniversaire <= debutDate) continue
      if (anniversaire > REFERENCE_TEMPORELLE) continue

      // R2 : ratio = IRL(T(n), y) / IRL(T(n), y-1), depuis la map uniquement.
      // R6 : indice précédent ou courant manquant, ou précédent <= 0 ->
      // révision sautée. (cour <= 0 est écarté aussi : un ratio nul/négatif
      // annulerait le loyer et bloquerait toutes les révisions suivantes ;
      // R6 ne le mentionne pas mais aucun ratio <= 0 n'est jouable.)
      // R7 : sans map mais avec un taux fixe -> ratio = 1 + taux/100.
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
      if (ratio === null) continue // R6/R7 : rien à appliquer -> sautée

      loyer = centimes(loyer * ratio) // R4 : arrondi au centime à CHAQUE révision
      revisions++
    }
    // R12 : rejeu strictement année par année — une paire d'indices sur 2 ans
    // n'est jamais rejouable en une fois.
    const deltaMois = centimes(loyer - b.loyerHcActuel)
    return {
      bailId: b.bailId,
      designation: b.designation,
      locataire: b.locataire,
      loyerActuel: b.loyerHcActuel,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: centimes(deltaMois * 12),
      revisionsJouees: revisions
    }
  })
}
