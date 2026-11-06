// ============================================================================
// Tests repository BIENS — CRUD complet et suppression en cascade
// (la cascade est codée : ON DELETE CASCADE sur baux/documents/dépenses).
// ============================================================================

import assert from 'node:assert/strict'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import { getRawConnection } from '../../src/main/database/connection'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

export function registreBienTests(test: TestFn): void {
  test('biens: create → get → update (timestamp updated_at avance)', () => {
    const ref = referenceUnique('T-BIEN')
    const bien = bienRepository.create({
      type_bien: 'Appartement',
      designation: ref,
      nom: ref,
      adresse: '12 rue de Test',
      code_postal: '42000',
      ville: 'Saint-Étienne',
      surface_m2: 65.5,
      meuble: true,
      dpe: 'C'
    }) as { id: number; created_at: string; updated_at: string }
    const lu = bienRepository.getById(bien.id) as {
      nom: string
      surface_m2: number
      meuble: boolean
      dpe: string
    }
    assert.equal(lu.nom, ref)
    assert.equal(lu.surface_m2, 65.5)
    assert.equal(lu.meuble, true)
    assert.equal(lu.dpe, 'C')

    const maj = bienRepository.update(bien.id, { surface_m2: 66, dpe: 'B' }) as {
      surface_m2: number
      dpe: string
      updated_at: string
      created_at: string
    }
    assert.equal(maj.surface_m2, 66)
    assert.equal(maj.dpe, 'B')
    assert.ok(maj.updated_at >= maj.created_at, 'updated_at >= created_at')
  })

  test('biens: delete → cascade sur les baux liés (ON DELETE CASCADE)', () => {
    const ref = referenceUnique('T-BIEN-CASCADE')
    const bien = bienRepository.create({ type_bien: 'Garage', designation: ref, nom: ref }) as {
      id: number
    }
    const loc = locataireRepository.create({ nom_complet: referenceUnique('Loc Cascade') }) as {
      id: number
    }
    bailRepository.create({
      bien_id: bien.id,
      locataire_id: loc.id,
      actif: true,
      loyer_hc: 60,
      loyer_cc: 60
    })
    const nBauxAvant = (
      getRawConnection().prepare('SELECT COUNT(*) n FROM baux WHERE bien_id = ?').get(bien.id) as {
        n: number
      }
    ).n
    assert.equal(nBauxAvant, 1)
    bienRepository.delete(bien.id)
    const nBauxApres = (
      getRawConnection().prepare('SELECT COUNT(*) n FROM baux WHERE bien_id = ?').get(bien.id) as {
        n: number
      }
    ).n
    assert.equal(nBauxApres, 0, 'baux supprimés en cascade')
    assert.equal(bienRepository.getById(bien.id), undefined)
    // Le locataire survit (indépendant du bien).
    assert.ok(locataireRepository.getById(loc.id), 'le locataire n’est pas cascadiné')
  })
}
