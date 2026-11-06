import { describe, it, expect } from 'vitest'
import { referenceQuittance } from '../shared/quittance-ref'

// La référence QUITT est unique et stable (index UNIQUE en base sur
// reference_number) : une référence fausse = collision ou trace perdue.

describe('referenceQuittance', () => {
  it('format QUITT-{AAAA}{MM}-{ID sur 3 chiffres}', () => {
    expect(referenceQuittance(1, '2026-11')).toBe('QUITT-202611-001')
    expect(referenceQuittance(42, '2025-01')).toBe('QUITT-202501-042')
    expect(referenceQuittance(1234, '2024-12')).toBe('QUITT-202412-1234')
  })

  it('déterministe : même (bail, période) → même référence (stable à la régénération)', () => {
    expect(referenceQuittance(7, '2026-03')).toBe(referenceQuittance(7, '2026-03'))
  })

  it('deux baux sur la même période → références distinctes', () => {
    expect(referenceQuittance(1, '2026-11')).not.toBe(referenceQuittance(2, '2026-11'))
  })

  it('période invalide → EXCEPTION (protège l index unique en base)', () => {
    expect(() => referenceQuittance(1, 'octobre')).toThrow()
    expect(() => referenceQuittance(1, '')).toThrow()
    expect(() => referenceQuittance(1, '2026-1')).toThrow()
    expect(() => referenceQuittance(1, '2026-13')).not.toThrow() // format ok, pas la sémantique
  })
})
