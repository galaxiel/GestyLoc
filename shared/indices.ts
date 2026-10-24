// Types partagés pour la récupération des indices INSEE (IRL / ICC).
// L'implémentation (fetch + parsing SDMX) vit dans le main :
// src/main/services/indices.service.ts

export type TypeIndice = 'IRL' | 'ICC'

/** Une observation trimestrielle : periode "2025-T4", valeur 145.78. */
export interface ValeurIndice {
  periode: string
  valeur: number
}

export interface IndicesResult {
  type: TypeIndice
  titre: string
  valeurs: ValeurIndice[]
  erreur: string | null
}
