// ============================================================================
// Récupération des indices INSEE (IRL / ICC) depuis les serveurs publics de
// l'INSEE (BDM / SDMX, sans clé d'API). Nécessite une connexion internet ;
// la saisie manuelle reste toujours possible (l'app fonctionne hors ligne).
//
// Séries utilisées (identifiants BDM officiels) :
//   IRL : 001515333 — Indice de référence des loyers (base 100 T4 1998)
//   ICC : 000008630 — Indice du coût de la construction (base 100 T4 1953)
// ============================================================================

import type { TypeIndice, ValeurIndice, IndicesResult } from '@shared/indices'

export type { TypeIndice, ValeurIndice, IndicesResult }

const SERIES: Record<TypeIndice, string> = {
  IRL: '001515333',
  ICC: '000008630'
}

const TITRES: Record<TypeIndice, string> = {
  IRL: 'Indice de référence des loyers (IRL)',
  ICC: 'Indice du coût de la construction (ICC)'
}

/**
 * Récupère les 8 derniers trimestres publiés pour l'indice demandé.
 * Endpoint SDMX public : https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/<id>
 */
export async function recupererIndices(type: TypeIndice): Promise<IndicesResult> {
  return fetchIndices(type, `${new Date().getFullYear() - 3}-Q1`)
}

/** Historique complet depuis 2004 (pour le simulateur de rattrapage IRL). */
export async function fetchIndices(
  type: TypeIndice,
  startPeriod: string
): Promise<IndicesResult> {
  const url =
    `https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/${SERIES[type]}` +
    `?startPeriod=${startPeriod}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.sdmx.structurespecificdata+xml' },
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!res.ok) {
      throw new Error(`INSEE a répondu ${res.status}`)
    }
    const xml = await res.text()

    // Le SDMX "structurespecific" expose chaque observation en attributs :
    // <Obs TIME_PERIOD="2026-Q3" OBS_VALUE="148.06" .../>
    const observations = [...xml.matchAll(/TIME_PERIOD="([^"]+)"\s+OBS_VALUE="([^"]+)"/g)]
      .map((m) => ({ brut: m[1], valeur: parseFloat(m[2]) }))
      .filter((o) => !isNaN(o.valeur))

    if (observations.length === 0) {
      throw new Error('Aucune valeur exploitable dans la réponse INSEE.')
    }

    const valeurs: ValeurIndice[] = observations
      .map((o) => ({ periode: o.brut.replace('-Q', '-T'), valeur: o.valeur }))
      .sort((a, b) => b.periode.localeCompare(a.periode)) // antéchronologique
      .slice(0, 8)

    return { type, titre: TITRES[type], valeurs, erreur: null }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Délai dépassé en contactant l’INSEE.'
          : err.message
        : String(err)
    return { type, titre: TITRES[type], valeurs: [], erreur: message }
  }
}
