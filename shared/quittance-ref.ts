// ============================================================================
// Référence unique de quittance — partagé main <-> renderer.
// Format : QUITT-{AAAA}{MM}-{ID_BAIL} (déterministe : la clé composite
// bail_id + periode garantit l'unicité et la stabilité à la régénération).
// ============================================================================

export function referenceQuittance(bailId: number, periode: string): string {
  // Garde : periode doit être 'yyyy-mm' (sinon la référence serait
  // « QUITT-octobreundefined-001 » et violerait l'index unique).
  if (!/^\d{4}-\d{2}$/.test(periode)) {
    throw new Error(`Période invalide pour la référence de quittance : « ${periode} »`)
  }
  const [a, m] = periode.split('-')
  return `QUITT-${a}${m}-${String(bailId).padStart(3, '0')}`
}
