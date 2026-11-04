// ============================================================================
// Utilitaires CSV/formats français — purs (testables), partagés main/renderer.
// Utilisés par l'import de tableur (Google Sheets / Excel exporté en CSV).
// ============================================================================

/**
 * Détecte le séparateur d'un CSV : Excel-fr exporte avec « ; », Google
 * Sheets avec « ; » ou « , » selon la locale. Heuristique : on compte les
 * séparateurs de la 1re ligne (les en-têtes) — « ; » gagne s'il est plus
 * fréquent que « , ».
 */
function detecteSeparateur(text: string): string {
  const premiereLigne = text.split('\n', 1)[0] ?? ''
  const nb = (ch: string): number => premiereLigne.split(ch).length - 1
  return nb(';') > nb(',') ? ';' : ','
}

/**
 * Parser CSV gérant les guillemets, les séparateurs échappées ("") et les
 * retours à la ligne embarqués dans les cellules.
 * - Strippe le BOM UTF-8 (écrit par Excel et par notre propre export).
 * - Détecte automatiquement le séparateur (« ; » Excel-fr ou « , ») ;
 *   forçable via le 2e argument.
 */
export function parseCsv(text: string, separateur?: string): string[][] {
  const t = text.replace(/^\uFEFF/, '')
  const sep = separateur ?? detecteSeparateur(t)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === sep) {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/**
 * Nombre français -> nombre : "19,12 €", "7 868,55 €", "0,879%" -> 19.12, 7868.55, 0.879
 * Retourne null si vide/illisible.
 */
export function frNombre(v: string | null | undefined): number | null {
  if (!v || !v.trim()) return null
  const clean = v.replace(/[€\s\u00A0\u202F%]/g, '').replace(',', '.')
  const n = parseFloat(clean)
  return isNaN(n) ? null : n
}

/**
 * Date française -> ISO : "19/10/2024" -> "2024-10-19". Null si absente
 * ou sémantiquement invalide (31/02/2024 -> null, pas de date fantôme).
 */
export function frDate(v: string | null | undefined): string | null {
  const m = (v ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const jour = parseInt(m[1], 10)
  const mois = parseInt(m[2], 10)
  const annee = parseInt(m[3], 10)
  // Validation sémantique : aller-retour via Date (les mois 0-11 rejettent
  // les jours excédentaires comme le 31 février).
  const d = new Date(annee, mois - 1, jour)
  if (d.getFullYear() !== annee || d.getMonth() !== mois - 1 || d.getDate() !== jour) {
    return null
  }
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** Échappe une valeur pour un CSV Excel-fr (séparateur ;). */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Sérialise des lignes en CSV Excel-fr (séparateur ; + BOM UTF-8). */
export function versCsv(entetes: string[], lignes: unknown[][]): string {
  const lines = [entetes, ...lignes].map((l) => l.map(csvCell).join(';'))
  return '\uFEFF' + lines.join('\n')
}
