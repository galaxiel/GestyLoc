import { describe, it, expect } from 'vitest'
import { resumerAlertesUrgentes, MAX_ALERTES_NOTIFIEES } from '../shared/notifications'

describe('resumerAlertesUrgentes', () => {
  it('retourne null sans alerte urgente', () => {
    expect(resumerAlertesUrgentes([])).toBeNull()
    expect(
      resumerAlertesUrgentes([
        { severite: 'info', message: 'Révision IRL à échéance' },
        { severite: 'warning', message: 'Bail à renouveler' }
      ])
    ).toBeNull()
  })

  it('résume une seule alerte urgente (singulier)', () => {
    const r = resumerAlertesUrgentes([
      { severite: 'urgent', message: 'Loyer impayé depuis 2 mois' }
    ])
    expect(r).toEqual({
      titre: 'GestyLoc — 1 alerte urgente',
      corps: '• Loyer impayé depuis 2 mois'
    })
  })

  it('résume plusieurs alertes urgentes (pluriel) et ignore les non urgentes', () => {
    const r = resumerAlertesUrgentes([
      { severite: 'info', message: 'Info ignorée' },
      { severite: 'urgent', message: 'A' },
      { severite: 'urgent', message: 'B' }
    ])
    expect(r?.titre).toBe('GestyLoc — 2 alertes urgentes')
    expect(r?.corps).toBe('• A\n• B')
  })

  it('tronque au-delà du maximum et compte le reste', () => {
    const alertes = Array.from({ length: MAX_ALERTES_NOTIFIEES + 2 }, (_, i) => ({
      severite: 'urgent',
      message: `M${i}`
    }))
    const r = resumerAlertesUrgentes(alertes)
    expect(r?.corps.split('\n')).toHaveLength(MAX_ALERTES_NOTIFIEES + 1)
    expect(r?.corps.endsWith('… et 2 autres.')).toBe(true)
  })
})
