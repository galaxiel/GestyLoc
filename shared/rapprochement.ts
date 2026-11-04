// ============================================================================
// Rapprochement bancaire assisté — fonctions PURES (testables).
// Principe (décision ROADMAP 26/10/2026, « voie simple ») : le bailleur
// exporte le relevé de sa banque en CSV, GestyLoc propose les pointages
// (montant + période → bail), il valide en masse. Zéro frais récurrent,
// zéro risque réglementaire, marche avec n'importe quelle banque.
//
// Le matching combine deux signaux :
//   1. le MONTANT : |montant| = loyer attendu du bail pour la période
//      (mois de l'opération ou mois précédent — les loyers de décembre
//      tombent souvent début janvier, et l'inverse) ;
//   2. le NOM : le libellé contient le nom du locataire.
// Une proposition n'est émise que si le montant colle ; le nom départage
// les ambiguïtés. Sans signal certain → « à revoir » (jamais de pointage
// automatique hasardeux).
// ============================================================================

import { parseCsv, frNombre, frDate } from './csv'

export interface TransactionReleve {
  date: string | null // ISO si reconnue
  libelle: string
  montant: number // signé : débit négatif côté relevé bancaire
}

export interface BailPourRapprochement {
  bailId: number
  locataire: string
  designation: string
  /** Loyer attendu (prorata compris) par période candidate 'yyyy-mm'. */
  attendusParPeriode: { periode: string; montant: number }[]
}

export type Confiance = 'haute' | 'moyenne' | 'revoir'

export interface PropositionPointage {
  transaction: TransactionReleve
  bailId: number | null
  periode: string | null
  locataire: string | null
  montantAttendu: number | null
  confiance: Confiance
  motif: string // explication affichée dans l'UI
}

const TOLERANCE_CENTIMES = 0.01

/** Normalise pour comparaison de noms : minuscule, sans accents ni ponctuation. */
export function normaliseNom(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** 'yyyy-mm' du mois précédent (gère le passage d'année). */
export function periodePrecedente(periode: string): string {
  const [a, m] = periode.split('-').map((x) => parseInt(x, 10))
  if (isNaN(a) || isNaN(m)) return periode
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}

/** Jour du mois courant en ISO (date d'opération par défaut du pointage). */
function isoDeDateCellule(v: string): string | null {
  const t = v.trim()
  // 19/10/2024 (fr) — frDate gère la validation sémantique
  const fr = frDate(t)
  if (fr) return fr
  // 2024-10-19 (ISO, certains banques)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null
}

/**
 * Parse un relevé bancaire CSV. Détecte les colonnes date / libellé /
 * montant via les en-têtes (fr + en) ; sans en-tête exploitable, retombe
 * sur une heuristique par ligne (cellule date, cellule numérique signée,
 * libellé = plus longue cellule restante).
 */
export function parseReleve(text: string): TransactionReleve[] {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (rows.length === 0) return []

  // --- 1) Détection d'en-tête ---
  const motsDate = /^(date|date operation|dateopération|date valeur|date)/i
  const motsLibelle = /(libelle|libellé|label|description|operation|opération|motif)/i
  const motsMontant = /(montant|valeur|credit|crédit|debit|débit|amount)/i
  const enTete = rows[0]
  let idxDate = -1
  let idxLibelle = -1
  let idxMontant = -1
  enTete.forEach((cell, i) => {
    const c = cell.trim()
    if (idxDate < 0 && motsDate.test(c)) idxDate = i
    else if (idxLibelle < 0 && motsLibelle.test(c)) idxLibelle = i
    else if (idxMontant < 0 && motsMontant.test(c)) idxMontant = i
  })
  const aEnTete = idxMontant >= 0 && (idxDate >= 0 || idxLibelle >= 0)
  const corps = aEnTete ? rows.slice(1) : rows

  const out: TransactionReleve[] = []
  for (const row of corps) {
    let date: string | null = null
    let montant: number | null = null
    let libelle = ''
    if (aEnTete) {
      date = idxDate >= 0 ? isoDeDateCellule(row[idxDate] ?? '') : null
      montant = idxMontant >= 0 ? frNombre(row[idxMontant] ?? '') : null
      if (idxLibelle >= 0) libelle = (row[idxLibelle] ?? '').trim()
      if (libelle === '') {
        libelle =
          row
            .filter((_, i) => i !== idxDate && i !== idxMontant)
            .map((c) => c.trim())
            .filter(Boolean)
            .sort((a, b) => b.length - a.length)[0] ?? ''
      }
    } else {
      // Heuristique sans en-tête.
      let idxDateTrouve = -1
      let idxMontantTrouve = -1
      for (let i = 0; i < row.length; i++) {
        const c = row[i]?.trim() ?? ''
        if (idxDateTrouve < 0 && date === null && /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(c)) {
          const d = isoDeDateCellule(c)
          if (d) {
            date = d
            idxDateTrouve = i
            continue
          }
        }
        if (idxMontantTrouve < 0 && /-?\d{1,3}([ \u00A0\u202F]?\d{3})*[,.]\d{2}/.test(c)) {
          const n = frNombre(c)
          if (n !== null) {
            montant = n
            idxMontantTrouve = i
          }
        }
      }
      libelle =
        row
          .filter((_, i) => i !== idxDateTrouve && i !== idxMontantTrouve)
          .map((c) => c.trim())
          .filter(Boolean)
          .sort((a, b) => b.length - a.length)[0] ?? ''
    }
    if (montant === null || montant === 0) continue // pas une opération chiffrée
    out.push({ date, libelle, montant })
  }
  return out
}

/** Dernier mot significatif du nom (« Jean Dupont » → « dupont »). */
function nomDeFamille(nomComplet: string): string {
  const mots = normaliseNom(nomComplet).split(' ').filter(Boolean)
  return mots.length > 0 ? mots[mots.length - 1] : ''
}

/** Le libellé évoque-t-il ce locataire ? (nom complet OU nom de famille) */
function libelleContientNom(libelle: string, locataire: string): boolean {
  const l = normaliseNom(libelle)
  const complet = normaliseNom(locataire)
  if (complet !== '' && l.includes(complet)) return true
  const famille = nomDeFamille(locataire)
  return famille.length >= 3 && l.includes(famille)
}

// ============================================================================
// Règles mémorisées (v2) : quand le bailleur pointe un loyer depuis un
// libellé bancaire, GestyLoc retient « ce libellé → ce bail ». Le mois
// suivant, la même ligne de virement est reconnue immédiatement, même si
// le nom du locataire n'apparaît pas dans le libellé. Stocké dans la table
// parametres (clé 'rapprochement'), 100 % local.
// ============================================================================

/**
 * Clé de mémorisation d'un libellé : normalisé SANS les chiffres (les dates
 * et références varient d'un mois à l'autre, les mots restent).
 * ex : « Virement LOYER Cathelin 03/11 » → « virement loyer cathelin »
 */
export function cleRegle(libelle: string): string {
  return normaliseNom(libelle.replace(/\d+/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** Règles stockées : clé de libellé → bail_id. */
export type ReglesRapprochement = Record<string, number>

/**
 * Propose un pointage pour chaque transaction. `periodeReference` est la
 * période pointée dans l'UI ; les candidates pour une opération sont le mois
 * de l'opération (si présent) entouré de la période de référence et son
 * mois précédent. Un pointage déjà 'paye'/'partiel' ne doit PAS être proposé :
 * l'UI filtre `attendusParPeriode` en conséquence.
 * `regles` (optionnel) : libellés déjà pointés par le passé → bail — une règle
 * reconnue prime sur le nom et lève l'ambiguïté (confiance haute).
 */
export function proposerPointages(
  transactions: TransactionReleve[],
  baux: BailPourRapprochement[],
  periodeReference: string,
  regles: ReglesRapprochement = {}
): PropositionPointage[] {
  const candidates = [periodeReference, periodePrecedente(periodeReference)]
  return transactions.map((t) => {
    const abs = Math.abs(t.montant)
    // Périodes candidates : mois de l'opération ± la référence.
    const periodes = new Set(candidates)
    if (t.date) {
      const p = t.date.slice(0, 7)
      periodes.add(p)
      periodes.add(periodePrecedente(p))
    }
    // Toutes les paires (bail, période) dont le loyer attendu = |montant|.
    // Une règle mémorisée (libellé déjà pointé) identifie le bail d'office.
    const cle = t.libelle !== '' ? cleRegle(t.libelle) : ''
    const bailRegle =
      cle !== '' && typeof regles[cle] === 'number'
        ? baux.find((b) => b.bailId === regles[cle])
        : undefined
    const matches: {
      bail: BailPourRapprochement
      periode: string
      attendu: number
      nom: boolean
      regle: boolean
    }[] = []
    for (const bail of baux) {
      const nomOk = t.libelle !== '' && libelleContientNom(t.libelle, bail.locataire)
      for (const { periode, montant } of bail.attendusParPeriode) {
        if (!periodes.has(periode)) continue
        if (Math.abs(abs - montant) <= TOLERANCE_CENTIMES) {
          matches.push({ bail, periode, attendu: montant, nom: nomOk, regle: bail === bailRegle })
        }
      }
    }
    if (matches.length === 0) {
      return {
        transaction: t,
        bailId: null,
        periode: null,
        locataire: null,
        montantAttendu: null,
        confiance: 'revoir' as Confiance,
        motif: `Aucun loyer attendu de ${abs.toFixed(2).replace('.', ',')} € sur les périodes candidates`
      }
    }
    // La règle mémorisée prime (elle vient d'un pointage du bailleur),
    // puis le nom dans le libellé ; sinon une correspondance unique suffit.
    const avecRegle = matches.filter((m) => m.regle)
    const avecNom = matches.filter((m) => m.nom)
    let retenue = avecRegle.length > 0 ? avecRegle : avecNom.length > 0 ? avecNom : matches
    // Même bail matché sur plusieurs périodes (oct. ET nov. à 450 €) : on
    // préfère la période de référence du pointage (celle que l'utilisateur
    // regarde), sinon on garde le mois de l'opération.
    const prefs = retenue.filter((m) => m.periode === periodeReference)
    if (prefs.length > 0) retenue = prefs
    if (retenue.length === 1) {
      const m = retenue[0]
      return {
        transaction: t,
        bailId: m.bail.bailId,
        periode: m.periode,
        locataire: m.bail.locataire,
        montantAttendu: m.attendu,
        confiance: m.regle || m.nom ? ('haute' as Confiance) : ('moyenne' as Confiance),
        motif: m.regle
          ? `Règle mémorisée : ce libellé était déjà pointé vers ${m.bail.locataire} (montant exact)`
          : m.nom
            ? `Montant exact (${abs.toFixed(2).replace('.', ',')} €) + nom reconnu dans le libellé`
            : `Montant exact (${abs.toFixed(2).replace('.', ',')} €), correspondance unique`
      }
    }
    // Plusieurs candidats équivalents : à revoir (jamais d'attribution au hasard).
    const noms = [...new Set(retenue.map((m) => m.bail.locataire))]
    return {
      transaction: t,
      bailId: null,
      periode: null,
      locataire: null,
      montantAttendu: null,
      confiance: 'revoir' as Confiance,
      motif: `Montant exact mais ambigu : ${noms.join(', ')}${noms.length !== retenue.length ? ` (${retenue.length} périodes)` : ''} — à attribuer manuellement`
    }
  })
}
