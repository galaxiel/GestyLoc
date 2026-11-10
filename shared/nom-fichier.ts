// ============================================================================
// Noms de fichiers des PDF générés côté renderer — module PUR (aucune
// dépendance Node/Electron), testé par vitest. Un nom de fichier doit rester
// sûr sous Windows : sans accents, ni espaces, ni caractères réservés.
// ============================================================================

/** Slug sûr : sans accents, caractères spéciaux remplacés par `_`. */
export function slugNomFichier(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Repli quand le slug est vide (nom absent ou uniquement ponctuation). */
export function slugOuDefaut(nom: string, defaut: string): string {
  const s = slugNomFichier(nom)
  return s.length > 0 ? s : defaut
}

/** Décompte de régularisation des charges : `regularisation_charges_<slug>_<annee>.pdf`. */
export function nomFichierDecompte(nomLocataire: string, annee: number): string {
  return `regularisation_charges_${slugOuDefaut(nomLocataire, 'bail')}_${annee}.pdf`
}
