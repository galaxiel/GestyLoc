// ============================================================================
// Libellés de biens — source unique pour TOUS les affichages (dropdowns,
// listes, tableaux). Un bien ne doit jamais s'afficher par sa seule
// désignation : dans un parc réel, plusieurs studios/garages partagent la
// même adresse. Libellé canonique : "Type · Désignation — Locataire".
// ============================================================================

export interface BienLabelSource {
  type_bien: string
  designation: string
  locataire?: string
}

/** "Garage · 11 rue renoir — M. Cathelin" (ou sans locataire si absent). */
export function libelleBien(b: BienLabelSource): string {
  const type = b.type_bien ? `${b.type_bien} · ` : ''
  return b.locataire ? `${type}${b.designation} — ${b.locataire}` : `${type}${b.designation}`
}

/** Tri canonique par libellé composé (désignation, puis locataire). */
export function triParLibelle<T>(liste: T[], libelle: (x: T) => string): T[] {
  return [...liste].sort((a, b) => libelle(a).localeCompare(libelle(b)))
}
