// ============================================================================
// Référence unique de quittance — partagé main <-> renderer.
// Format : QUITT-{AAAA}{MM}-{ID_BAIL} (déterministe : la clé composite
// bail_id + periode garantit l'unicité et la stabilité à la régénération).
// ============================================================================

export function referenceQuittance(bailId: number, periode: string): string {
  const [a, m] = periode.split('-')
  return `QUITT-${a}${m}-${String(bailId).padStart(3, '0')}`
}
