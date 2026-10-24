// ============================================================================
// Utilitaires CSV/formats français — purs (testables), partagés main/renderer.
// Utilisés par l'import de tableur (Google Sheets / Excel exporté en CSV).
// ============================================================================

/**
 * Parser CSV gérant les guillemets, les virgules échappées ("") et les
 * retours à la ligne embarqués dans les cellules.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
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
    } else if (c === ',') {
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
 * Date française -> ISO : "19/10/2024" -> "2024-10-19". Null si absente.
 */
export function frDate(v: string | null | undefined): string | null {
  const m = (v ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** Échappe une valeur pour un CSV Excel-fr (séparateur ;). */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Sérialise des lignes en CSV Excel-fr (séparateur ; + BOM UTF-8). */
export function versCsv(entetes: string[], lignes: unknown[][]): string {
  const lines = [entetes, ...lignes].map((l) => l.map(csvCell).join(';'))
  return '\uFEFF' + lines.join('\n')
}
