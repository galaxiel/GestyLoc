// ============================================================================
// Tests service DONNÉES — sauvegarde automatique hebdomadaire : fichier créé
// dans userData redirigé, rotation à 5, paramètre `sauvegarde_auto`.
// ============================================================================

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  executerSauvegardeAuto,
  dossierSauvegardesAuto
} from '../../src/main/services/donnees.service'
import { parametresRepository } from '../../src/main/repositories/parametres.repository'
import { estSauvegardeAuto } from '../../shared/sauvegarde'
import type { TestFn } from './harnais'

export async function registreSauvegardeTests(test: TestFn): Promise<void> {
  await test('sauvegarde auto: première exécution crée le fichier, la rotation garde 5', () => {
    const dossier = dossierSauvegardesAuto()
    if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true })
    // 6 fausses sauvegardes anciennes : avec la nouvelle, la rotation doit
    // n'en garder que 5 et supprimer la plus vieille.
    for (const nom of [
      'auto_2026-08-01_120000.db',
      'auto_2026-09-01_120000.db',
      'auto_2026-09-02_120000.db',
      'auto_2026-09-03_120000.db',
      'auto_2026-09-04_120000.db',
      'auto_2026-09-05_120000.db'
    ]) {
      writeFileSync(join(dossier, nom), 'x')
    }

    const fichier = executerSauvegardeAuto()
    assert.ok(fichier, 'une sauvegarde doit être créée (aucune précédente)')
    assert.ok(existsSync(fichier), 'le fichier de sauvegarde existe')
    assert.ok(estSauvegardeAuto(fichier.split(/[\\/]/).pop() ?? ''), 'nom au format auto_*')

    const auto = readdirSync(dossier).filter(estSauvegardeAuto)
    assert.equal(auto.length, 5, 'rotation : 5 sauvegardes auto exactement')
    assert.ok(!auto.includes('auto_2026-08-01_120000.db'), 'la plus ancienne est supprimée')

    const param = parametresRepository.get<{ derniere: string }>('sauvegarde_auto')
    assert.ok(param?.derniere, 'paramètre sauvegarde_auto persisté')
    assert.ok(!Number.isNaN(Date.parse(param.derniere)), 'derniere est une date ISO')
  })

  await test('sauvegarde auto: pas de nouvelle copie avant 7 jours', () => {
    parametresRepository.set('sauvegarde_auto', { derniere: new Date().toISOString() })
    assert.equal(executerSauvegardeAuto(), null)
  })
}
