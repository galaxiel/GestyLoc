// ============================================================================
// Sauvegarde automatique hebdomadaire de la base — module PUR (aucune
// dépendance Node/Electron), consommé par le processus main (service données)
// et testé par vitest. Le nommage et la rotation sont décidés ICI pour rester
// testables sans système de fichiers.
// ============================================================================

/** Nombre de sauvegardes automatiques conservées (rotation). */
export const SAUVEGARDE_AUTO_MAX = 5

/** Intervalle (en jours) entre deux sauvegardes automatiques. */
export const SAUVEGARDE_AUTO_JOURS = 7

/** État persisté dans `parametres` (clé `sauvegarde_auto`). */
export interface SauvegardeAutoState {
  derniere: string // date ISO
}

const RE_FICHIER = /^auto_(\d{4}-\d{2}-\d{2})_(\d{6})\.db$/

/** Nom horodaté d'une sauvegarde automatique : `auto_AAAA-MM-JJ_HHMMSS.db`. */
export function nomSauvegardeAuto(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const heure = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `auto_${date}_${heure}.db`
}

/** Vrai si le nom correspond au format des sauvegardes automatiques. */
export function estSauvegardeAuto(nom: string): boolean {
  return RE_FICHIER.test(nom)
}

/** Clé de tri chronologique d'un nom conforme (tri lexical = chronologique). */
function cleChrono(nom: string): string {
  return nom.replace(RE_FICHIER, '$1_$2')
}

/**
 * Rotation : garde les `max` sauvegardes les plus récentes et propose la
 * suppression des suivantes. Les fichiers hors format (avant_restauration_*,
 * avant_remise_a_zero_*, …) ne sont JAMAIS touchés.
 */
export function rotationSauvegardes(
  noms: string[],
  max: number = SAUVEGARDE_AUTO_MAX
): { aGarder: string[]; aSupprimer: string[] } {
  const tries = noms
    .filter((n) => RE_FICHIER.test(n))
    .sort((a, b) => cleChrono(b).localeCompare(cleChrono(a)))
  return { aGarder: tries.slice(0, max), aSupprimer: tries.slice(max) }
}

/**
 * Une sauvegarde est due si jamais faite, si la date persistée est illisible,
 * ou si la dernière date d'au moins `jours` jours.
 */
export function sauvegardeDue(
  derniere: string | null | undefined,
  maintenant: Date,
  jours: number = SAUVEGARDE_AUTO_JOURS
): boolean {
  if (!derniere) return true
  const t = Date.parse(derniere)
  if (!Number.isFinite(t)) return true
  return maintenant.getTime() - t >= jours * 24 * 60 * 60 * 1000
}
