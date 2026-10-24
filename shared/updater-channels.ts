// ============================================================================
// Canaux IPC de l'auto-updater — partagés entre main (Electron) et renderer
// (React). Fichier sans aucune dépendance importable par les deux côtés.
// ============================================================================

export const UPDATER_CHANNELS = {
  checking: 'updater:checking-for-update',
  available: 'updater:update-available',
  notAvailable: 'updater:update-not-available',
  progress: 'updater:download-progress',
  downloaded: 'updater:update-downloaded',
  error: 'updater:error'
} as const

/** Payload envoyé au renderer quand une mise à jour est disponible. */
export interface UpdateAvailablePayload {
  version: string
  releaseNotes: string | null
  releaseDate: string
}

/** Payload de progression de téléchargement. */
export interface DownloadProgressPayload {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}
