/** Formatage montants en euros (fr-FR). */
export function formatEuro(montant: number | null | undefined): string {
  if (montant === null || montant === undefined) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(montant)
}

/** Formatage date ISO (yyyy-mm-dd) -> jj/mm/aaaa. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

/** Formatage surface. */
export function formatSurface(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined) return '—'
  return `${m2.toLocaleString('fr-FR')} m²`
}

/** Période 'yyyy-mm' -> "octobre 2026". */
export function formatPeriode(periode: string): string {
  const [y, m] = periode.split('-')
  const mois = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ]
  const idx = parseInt(m, 10) - 1
  if (isNaN(idx) || !mois[idx]) return periode
  return `${mois[idx]} ${y}`
}

/** Période 'yyyy-mm' du mois courant. */
export function periodeCourante(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Libellé lisible des statuts de paiement. */
export function libelleStatut(statut: string): string {
  const map: Record<string, string> = {
    paye: 'Payé',
    partiel: 'Partiel',
    retard: 'En retard',
    impaye: 'Impayé'
  }
  return map[statut] ?? statut
}
