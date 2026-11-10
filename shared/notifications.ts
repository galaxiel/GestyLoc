// ============================================================================
// Notifications système — module PUR (aucune dépendance Node/Electron).
// Construit le résumé d'alertes URGENTES affiché en notification Windows au
// démarrage (le processus main se charge de l'affichage réel).
// ============================================================================

/** Nombre d'alertes détaillées dans le corps ; le reste est compté. */
export const MAX_ALERTES_NOTIFIEES = 3

export interface ResumeNotification {
  titre: string
  corps: string
}

/**
 * Résumé à notifier, ou `null` s'il n'y a aucune alerte urgente (rien à
 * afficher). Seules les alertes de sévérité `urgent` déclenchent une
 * notification — les `info`/`warning` restent dans le Dashboard.
 */
export function resumerAlertesUrgentes(
  alertes: { severite: string; message: string }[]
): ResumeNotification | null {
  const urgentes = alertes.filter((a) => a.severite === 'urgent')
  if (urgentes.length === 0) return null

  const pluriel = urgentes.length > 1 ? 's' : ''
  const titre = `GestyLoc — ${urgentes.length} alerte${pluriel} urgente${pluriel}`

  const visibles = urgentes.slice(0, MAX_ALERTES_NOTIFIEES).map((a) => `• ${a.message}`)
  const reste = urgentes.length - visibles.length
  if (reste > 0) visibles.push(`… et ${reste} autre${reste > 1 ? 's' : ''}.`)

  return { titre, corps: visibles.join('\n') }
}
