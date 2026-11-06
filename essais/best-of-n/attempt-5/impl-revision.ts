// ============================================================================
// attempt-5 — impl-revision.ts
// Réimplémentation de simulerRattrapageIrl depuis le CONTRAT §2 (R1-R12).
// Fonction PURE : aucun import, aucune E/S. La borne temporelle est la date
// système (R5/R10) ; le cadre d'exécution garantit la fenêtre gelée du §4
// (aucun anniversaire entre le 06/11 et le 30/11 → résultats stables).
//
// Choix propres à cette tentative :
//  - pas de table IRL embarquée : l'algorithme ne consulte QUE la map passée
//    en argument (R6 : un indice manquant saute la révision, jamais un
//    fallback vers les vraies valeurs INSEE) ;
//  - la boucle rejoue les anniversaires via des primitives arithmétiques
//    locales (pas d'objet Date conservé entre itérations) ;
//  - accès aux indices tolérant (Map contractuelle, objet brut accepté).
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

/** Arrondi au centime (R4 — arrondi obligatoire à CHAQUE révision). */
const auCentime = (x: number): number => Math.round(x * 100) / 100

/** 'yyyy-mm-dd' (préfixe ISO) -> date locale minuit ; null si illisible (R8).
 * Sémantique du code d'origine conservée : préfixe suffisant, débordement
 * calendaire toléré (constructor rollover), seul un NaN est rejeté. */
function dateDebut(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''))
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Dernier jour d'un mois (mois 0-based) — borne l'anniversaire (R9 :
 * bail du 29/02 → anniversaire le 28/02 les années non bissextiles). */
const dernierJourMois = (annee: number, mois0: number): number =>
  new Date(annee, mois0 + 1, 0).getDate()

/** R3 : trimestre d'indexation — celui du trimestreRef (parse ANCRÉ
 * /\bT([1-4])\b/ : « T3 2023 » → 3 sans attraper l'année), à défaut le
 * trimestre de la date de début. */
function trimestreDindexation(trimestreRef: string | null, debut: Date): number {
  const m = /\bT([1-4])\b/.exec(trimestreRef ?? '')
  return m ? Number(m[1]) : 1 + Math.floor(debut.getMonth() / 3)
}

/** Accès aux indices (clé '2024-Q3'). Map contractuelle ; un objet brut est
 * toléré (le couloir d'exécution le convertit en Map avant l'appel). */
type LectureIndice = (cle: string) => number | undefined
function lecteurIndices(src: Map<string, number> | null): LectureIndice | null {
  if (!src) return null
  if (typeof (src as Map<string, number>).get === 'function') {
    return (cle) => (src as Map<string, number>).get(cle)
  }
  const obj = src as unknown as Record<string, number>
  return (cle) => obj[cle]
}

/** R2/R6/R7 : ratio dû à l'anniversaire de l'année `annee`.
 * - Map fournie → IRL(Q, annee) / IRL(Q, annee-1) ; null si l'un des deux
 *   indices manque ou n'est pas exploitable (≤ 0 / non fini) → révision
 *   sautée (R6). L'indice courant non positif est également réputé
 *   inutilisable : un ratio nul ou négatif n'a pas de sens métier.
 * - Sinon, taux fixe non null → 1 + taux/100 (R7).
 * - Sinon (map ET taux null) → null : aucune révision. */
function ratioAnnuel(
  annee: number,
  trimestre: number,
  indice: LectureIndice | null,
  tauxFixeAnnuel: number | null
): number | null {
  if (indice) {
    const prec = indice(`${annee - 1}-Q${trimestre}`)
    const cour = indice(`${annee}-Q${trimestre}`)
    if (
      prec === undefined ||
      cour === undefined ||
      !Number.isFinite(prec) ||
      !Number.isFinite(cour) ||
      prec <= 0 ||
      cour <= 0
    ) {
      return null
    }
    return cour / prec
  }
  return tauxFixeAnnuel !== null && tauxFixeAnnuel !== undefined && Number.isFinite(tauxFixeAnnuel)
    ? 1 + tauxFixeAnnuel / 100
    : null
}

export function simulerRattrapageIrl(
  baux: BailPourSimulation[],
  anneeDepart: number,
  irlParTrimestre: Map<string, number> | null, // clé '2024-Q3'
  tauxFixeAnnuel: number | null // en %, ex 1.5 — utilisé si la map est null
): ResultatSimulationBail[] {
  const anneeCourante = new Date().getFullYear() // R5/R10
  const indice = lecteurIndices(irlParTrimestre)
  const maintenant = new Date()
  return (baux ?? []).map((bail): ResultatSimulationBail => {
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
    const debut = dateDebut(bail.dateDebutBail)
    if (debut === null || !(bail.loyerHcActuel > 0)) return identite // R8

    const trimestre = trimestreDindexation(bail.trimestreRef, debut) // R3
    let loyer = bail.loyerHcActuel
    let revisionsJouees = 0

    for (let annee = anneeDepart; annee <= anneeCourante; annee++) { // R5
      // R9 : anniversaire = même mois/jour, jour borné au dernier du mois.
      const jour = Math.min(debut.getDate(), dernierJourMois(annee, debut.getMonth()))
      const anniversaire = new Date(annee, debut.getMonth(), jour)
      if (anniversaire <= debut) continue // 1re année : échéance pas encore née (R5)
      if (anniversaire > maintenant) continue // échéance future : non encore due (R5)
      const ratio = ratioAnnuel(annee, trimestre, indice, tauxFixeAnnuel)
      if (ratio === null) continue // R6/R7 : révision sautée
      loyer = auCentime(loyer * ratio) // R4
      revisionsJouees++
    }

    const deltaMois = auCentime(loyer - bail.loyerHcActuel)
    return {
      ...identite,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: auCentime(deltaMois * 12),
      revisionsJouees
    }
  })
}
