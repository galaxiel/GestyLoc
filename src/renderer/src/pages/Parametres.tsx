import { useState, useEffect } from 'react'
import { RefreshCw, Rocket, Loader2 } from 'lucide-react'
import { UPDATER_EVENT, type UpdateAvailablePayload } from '../lib/updater'

const cardCls =
  'rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950'

export function Parametres(): React.JSX.Element {
  const [version, setVersion] = useState<string>('…')
  const [etat, setEtat] = useState<'inactif' | 'verification' | 'disponible' | 'telecharge' | 'erreur'>('inactif')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void window.electron.webFrame
    // Version de l'app (depuis package.json, injecté par electron).
    void window.electron.ipcRenderer.invoke('app:get-version').then(setVersion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verifierMiseAJour = async (): Promise<void> => {
    setEtat('verification')
    setMessage(null)
    const un = window.api.updater.on(UPDATER_EVENT.available, (payload) => {
      const info = payload as unknown as UpdateAvailablePayload
      setEtat('disponible')
      setMessage(`Nouvelle version ${info.version} disponible.`)
      un()
    })
    const nd = window.api.updater.on(UPDATER_EVENT.notAvailable, () => {
      setEtat('inactif')
      setMessage('Vous utilisez déjà la dernière version.')
      nd()
    })
    const ne = window.api.updater.on(UPDATER_EVENT.error, (payload) => {
      setEtat('erreur')
      setMessage(
        `Erreur de mise à jour : ${(payload as unknown as { message: string }).message}`
      )
      ne()
    })
    await window.api.updater.check()
  }

  const telechargerEtRedemarrer = async (): Promise<void> => {
    setEtat('verification')
    setMessage('Téléchargement de la mise à jour…')
    const nd = window.api.updater.on(UPDATER_EVENT.downloaded, () => {
      setEtat('telecharge')
      setMessage('Mise à jour téléchargée. Redémarrage pour installer…')
      nd()
      // Petite pause pour laisser l'utilisateur voir le message, puis install.
      setTimeout(() => void window.api.updater.install(), 2000)
    })
    await window.api.updater.download()
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Paramètres</h1>

      {/* Infos app */}
      <div className={cardCls}>
        <h2 className="mb-3 font-semibold">Application</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Version</dt>
            <dd className="font-medium">{version}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Stockage des données</dt>
            <dd className="font-medium">Local (AppData) — aucun internet requis</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Thème</dt>
            <dd className="font-medium">Suit le thème de Windows</dd>
          </div>
        </dl>
      </div>

      {/* Mise à jour */}
      <div className={cardCls}>
        <h2 className="mb-3 font-semibold">Mise à jour</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Les mises à jour sont vérifiées automatiquement au lancement (GitHub Releases).
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void verifierMiseAJour()}
            disabled={etat === 'verification'}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {etat === 'verification' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Vérifier maintenant
          </button>
          {etat === 'disponible' && (
            <button
              onClick={() => void telechargerEtRedemarrer()}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Rocket className="h-4 w-4" />
              Télécharger
            </button>
          )}
        </div>
        {message && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        )}
      </div>
    </div>
  )
}
