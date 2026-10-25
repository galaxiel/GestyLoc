# -*- coding: utf-8 -*-
# Régénère shared/irl-insee.ts depuis l'API SDMX publique de l'INSEE
# (série 001515333 — Indice de référence des loyers).
# Utilisé par le workflow GitHub Action trimestriel (.github/workflows/update-irl.yml)
# et relançable à la main : python scripts/update-irl.py
import re
import urllib.request

URL = 'https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/001515333?startPeriod=2004-Q1'
SORTIE = 'shared/irl-insee.ts'

req = urllib.request.Request(URL, headers={'Accept': 'application/vnd.sdmx.structurespecificdata+xml'})
xml = urllib.request.urlopen(req, timeout=30).read().decode('utf-8')
obs = sorted(re.findall(r'TIME_PERIOD="(\d{4}-Q[1234])"\s+OBS_VALUE="([\d.]+)"', xml))
assert len(obs) > 80, f'Réponse INSEE suspecte : {len(obs)} observations'

lignes = ',\n'.join(f'  "{p}": {v}' for p, v in obs)
ts = f'''// ============================================================================
// Table IRL embarquée — Indice de référence des loyers (INSEE, série 001515333,
// base 100 au T4 1998). Généré depuis l'API SDMX publique de l'INSEE.
// NE PAS ÉDITER À LA MAIN : régénéré par scripts/update-irl.py (workflow
// GitHub Action trimestriel `Mise à jour IRL`).
// ============================================================================

/** Clé "2024-T3" -> valeur 144.51. */
export const IRL_INSEE: Readonly<Record<string, number>> = {{
{lignes}
}}

/** Liste des trimestres disponibles, du plus récent au plus ancien. */
export const IRL_TRIMESTRES: string[] = Object.keys(IRL_INSEE).sort().reverse()

export function valeurIrl(trimestre: string): number | null {{
  return IRL_INSEE[trimestre] ?? null
}}
'''
open(SORTIE, 'w', encoding='utf-8', newline='\n').write(ts)
print(f'IRL régénérée : {len(obs)} trimestres ({obs[0][0]} -> {obs[-1][0]})')
