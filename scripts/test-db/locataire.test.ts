// ============================================================================
// Tests repository LOCATAIRES — CRUD et dédoublonnage par nom exact (le
// rapprochement et l'audit s'appuient sur ce comportement).
// ============================================================================

import assert from 'node:assert/strict'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

export function registreLocataireTests(test: TestFn): void {
  test('locataires: create avec contacts → get → update', () => {
    const nom = referenceUnique('T-LOC-CRUD')
    const loc = locataireRepository.create({
      nom_complet: nom,
      email: 'demo@example.com',
      telephone: '06 00 00 00 00',
      adresse: '3 rue de Test',
      code_postal: '42000',
      ville: 'Saint-Étienne'
    }) as { id: number; email: string }
    const lu = locataireRepository.getById(loc.id) as {
      email: string
      telephone: string
      ville: string
    }
    assert.equal(lu.email, 'demo@example.com')
    assert.equal(lu.telephone, '06 00 00 00 00')
    assert.equal(lu.ville, 'Saint-Étienne')
    const maj = locataireRepository.update(loc.id, { email: 'nouveau@example.com' }) as {
      email: string
    }
    assert.equal(maj.email, 'nouveau@example.com')
  })

  test('locataires: deux créations au même nom = deux fiches (dédoublon côté UI, pas en BDD)', () => {
    const nom = referenceUnique('T-LOC-DUP')
    locataireRepository.create({ nom_complet: nom })
    locataireRepository.create({ nom_complet: nom })
    const tous = locataireRepository.list().filter((l) => l.nom_complet === nom)
    assert.equal(tous.length, 2, 'la BDD ne dédoublonne pas (c est le rôle du formulaire)')
  })
}
