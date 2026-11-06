// ============================================================================
// Tests repository RÉGULARISATION DES CHARGES — upsert par (bail × année)
// : une seule ligne par couple, la dernière écriture gagne.
// ============================================================================

import assert from 'node:assert/strict'
import { regularisationRepository } from '../../src/main/repositories/regularisation.repository'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

export function registreRegularisationTests(test: TestFn): void {
  const ref = referenceUnique('T-REGUL')
  const bien = bienRepository.create({ type_bien: 'Appartement', designation: ref, nom: ref }) as {
    id: number
  }
  const loc = locataireRepository.create({ nom_complet: referenceUnique('Loc Regul') }) as {
    id: number
  }
  const bail = bailRepository.create({ bien_id: bien.id, locataire_id: loc.id, actif: true }) as {
    id: number
  }

  test('régularisations: upsert crée puis MET À JOUR (une ligne par bail × année)', () => {
    regularisationRepository.upsert(bail.id, 2025, 1009)
    regularisationRepository.upsert(bail.id, 2025, 844) // recorrection du bailleur
    const toutes = regularisationRepository
      .list()
      .filter((r) => r.bail_id === bail.id && r.annee === 2025)
    assert.equal(toutes.length, 1, 'une seule ligne pour (bail, 2025)')
    assert.equal(toutes[0].charges_reelles, 844, 'la dernière écriture gagne')
  })

  test('régularisations: deux années distinctes = deux lignes', () => {
    regularisationRepository.upsert(bail.id, 2026, 900)
    const rows = regularisationRepository.list().filter((r) => r.bail_id === bail.id)
    assert.equal(rows.length, 2)
  })
}
