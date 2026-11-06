import { describe, it, expect } from 'vitest'
import { UPDATER_CHANNELS } from '../shared/updater-channels'

// Les canaux de l'updater sont le contrat main ↔ renderer : un canal
// renommé d'un côté et pas de l'autre = mise à jour silencieusement morte.

describe('UPDATER_CHANNELS — contrat main ↔ renderer', () => {
  it('les 6 canaux attendus existent avec leur préfixe updater:', () => {
    expect(Object.keys(UPDATER_CHANNELS).sort()).toEqual(
      ['available', 'checking', 'downloaded', 'error', 'notAvailable', 'progress'].sort()
    )
    for (const canal of Object.values(UPDATER_CHANNELS)) {
      expect(canal.startsWith('updater:')).toBe(true)
    }
  })
})
