import { useState, useEffect } from 'react'
import { RefreshCw, Rocket, Loader2, User, Save, Database, Download, Upload, FileInput, FileOutput, Mail, Send, FolderOpen, Stethoscope } from 'lucide-react'
import type { ConstatAudit } from '@shared/audit'
import { UPDATER_EVENT, type UpdateAvailablePayload } from '../lib/updater'
import { ipc } from '../lib/ipc'

const cardCls =
  'rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950'

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900'

export function Parametres(): React.JSX.Element {
  const [version, setVersion] = useState<string>('…')
  const [etat, setEtat] = useState<'inactif' | 'verification' | 'disponible' | 'telecharge' | 'erreur'>('inactif')
  const [message, setMessage] = useState<string | null>(null)

  // --- Données : export / import / sauvegarde ---
  const [dataMsg, setDataMsg] = useState<string | null>(null)
  const [dataEnCours, setDataEnCours] = useState<string | null>(null)

  const executer = async (nom: string, action: () => Promise<string | null>): Promise<void> => {
    setDataEnCours(nom)
    setDataMsg(null)
    try {
      const res = await action()
      setDataMsg(res ?? 'Opération annulée.')
    } catch (err) {
      setDataMsg(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDataEnCours(null)
    }
  }

  // --- Audit des données ---
  const [auditResultats, setAuditResultats] = useState<ConstatAudit[] | null>(null)
  const [auditEnCours, setAuditEnCours] = useState(false)

  const lancerAudit = async (): Promise<void> => {
    setAuditEnCours(true)
    try {
      setAuditResultats((await window.api.audit.run()) as unknown as ConstatAudit[])
    } catch (err) {
      console.error(err)
    } finally {
      setAuditEnCours(false)
    }
  }

  // --- Chemin de la base ---
  const [cheminBdd, setCheminBdd] = useState<string | null>(null)
  useEffect(() => {
    void window.api.app
      .getDbPath()
      .then((r) => setCheminBdd(r.data ?? null))
      .catch(() => setCheminBdd(null))
  }, [])

  // --- Configuration Email (SMTP) ---
  const [smtp, setSmtp] = useState({
    host: '', port: '587', secure: false, utilisateur: '', mot_de_passe: '', expediteur_nom: ''
  })
  const [smtpConfigure, setSmtpConfigure] = useState(false)
  const [smtpMsg, setSmtpMsg] = useState<string | null>(null)
  const [smtpEnCours, setSmtpEnCours] = useState(false)

  useEffect(() => {
    void ipc.email
      .getConfig()
      .then((c) => {
        setSmtpConfigure(c.configure)
        setSmtp((prev) => ({
          ...prev,
          host: c.host,
          port: String(c.port),
          secure: c.secure,
          utilisateur: c.utilisateur,
          expediteur_nom: c.expediteur_nom
        }))
      })
      .catch(() => undefined)
  }, [])

  const enregistrerSmtp = async (): Promise<void> => {
    setSmtpEnCours(true)
    setSmtpMsg(null)
    try {
      await ipc.email.saveConfig({
        host: smtp.host.trim(),
        port: Number(smtp.port) || 587,
        secure: smtp.secure,
        utilisateur: smtp.utilisateur.trim(),
        mot_de_passe: smtp.mot_de_passe,
        expediteur_nom: smtp.expediteur_nom.trim()
      })
      setSmtpConfigure(true)
      setSmtpMsg('Configuration enregistrée.')
    } catch (err) {
      setSmtpMsg(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSmtpEnCours(false)
    }
  }

  const testerSmtp = async (): Promise<void> => {
    setSmtpEnCours(true)
    setSmtpMsg(null)
    try {
      await ipc.email.test()
      setSmtpMsg('Connexion SMTP vérifiée avec succès.')
    } catch (err) {
      setSmtpMsg(`Échec de connexion : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSmtpEnCours(false)
    }
  }

  // --- Profil bailleur ---
  const [bailleurNom, setBailleurNom] = useState('')
  const [bailleurAdresse, setBailleurAdresse] = useState('')
  const [bailleurMessage, setBailleurMessage] = useState<string | null>(null)

  useEffect(() => {
    // Version de l'app (depuis package.json, injecté par electron).
    void window.electron.ipcRenderer.invoke('app:get-version').then(setVersion)
    // Chargement du profil bailleur.
    void ipc.parametres
      .getBailleur()
      .then((profil) => {
        if (profil) {
          setBailleurNom(profil.nom_complet)
          setBailleurAdresse(profil.adresse)
        }
      })
      .catch(() => {
        /* profil absent : champs vides */
      })
  }, [])

  const enregistrerBailleur = async (): Promise<void> => {
    try {
      await ipc.parametres.setBailleur({
        nom_complet: bailleurNom.trim(),
        adresse: bailleurAdresse.trim()
      })
      setBailleurMessage('Profil enregistré — utilisé dans les quittances.')
    } catch (err) {
      setBailleurMessage(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    }
  }

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

      {/* Profil bailleur */}
      <div className={cardCls}>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <User className="h-4 w-4 text-primary-500" /> Profil bailleur
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Ces informations pré-remplissent la section « BAILLEUR » de vos quittances.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Nom complet
            </span>
            <input
              className={inputCls}
              value={bailleurNom}
              onChange={(e) => setBailleurNom(e.target.value)}
              placeholder="ex : Jean Martin"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Adresse
            </span>
            <textarea
              className={`${inputCls} min-h-[64px] resize-y`}
              value={bailleurAdresse}
              onChange={(e) => setBailleurAdresse(e.target.value)}
              placeholder="ex : 12 rue des Lilas, 75011 Paris"
            />
          </label>
          <button
            onClick={() => void enregistrerBailleur()}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Save className="h-4 w-4" /> Enregistrer
          </button>
          {bailleurMessage && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{bailleurMessage}</p>
          )}
        </div>
      </div>

      {/* Infos app */}
      <div className={cardCls}>
        <h2 className="mb-3 font-semibold">Application</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Version</dt>
            <dd className="font-medium">{version}</dd>
          </div>
          <div className="flex justify-between items-center gap-2">
            <dt className="text-slate-500 dark:text-slate-400">Stockage des données</dt>
            <dd className="font-medium">Local (AppData) — aucun internet requis</dd>
          </div>
          <div className="pt-2">
            <button
              onClick={() => void window.api.app.openDataFolder()}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <FolderOpen className="h-4 w-4" />
              Ouvrir le dossier des données
            </button>
            <p className="mt-1 truncate text-[11px] text-slate-400" title="Chemin de la base">
              {cheminBdd ?? '…'}
            </p>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Thème</dt>
            <dd className="font-medium">Suit le thème de Windows</dd>
          </div>
        </dl>
      </div>

      {auditResultats !== null && (
        <div className={cardCls}>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Stethoscope className="h-4 w-4 text-primary-500" /> Audit des données —{' '}
            {auditResultats.length === 0
              ? 'aucune anomalie 🎉'
              : `${auditResultats.length} constat(s)`}
          </h2>
          {auditResultats.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Adresses, doublons, IRL et loyers annuels : tout est cohérent.
            </p>
          ) : (
            <ul className="space-y-2">
              {auditResultats.map((c, i) => (
                <li
                  key={i}
                  className={`rounded-lg border p-3 text-sm ${
                    c.severite === 'critique'
                      ? 'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10'
                      : 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
                  }`}
                >
                  <div className="font-semibold">
                    {c.severite === 'critique' ? '🔴' : '🟡'} {c.categorie} — {c.designation}
                  </div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{c.detail}</div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-400">
            L'audit ne modifie rien — il liste les anomalies à corriger dans les pages
            concernées.
          </p>
        </div>
      )}

      {/* Email (SMTP) */}
      <div className={cardCls}>
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Mail className="h-4 w-4 text-primary-500" /> Email — envoi des quittances
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              smtpConfigure
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {smtpConfigure ? 'Configuré' : 'Non configuré'}
          </span>
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Configure ton serveur SMTP pour envoyer les quittances par email depuis
          l'application. Astuce Gmail / Orange / Outlook : utilise un{' '}
          <strong>mot de passe d'application</strong> (jamais ton mot de passe principal).
          Toutes les infos restent sur ton PC.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Serveur SMTP</span>
            <input className={inputCls} value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.gmail.com" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Port</span>
            <input className={inputCls} value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} placeholder="587" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Sécurité</span>
            <select
              className={inputCls}
              value={smtp.secure ? 'ssl' : 'starttls'}
              onChange={(e) => setSmtp({ ...smtp, secure: e.target.value === 'ssl' })}
            >
              <option value="starttls">STARTTLS (port 587)</option>
              <option value="ssl">SSL/TLS direct (port 465)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Adresse email (compte)</span>
            <input className={inputCls} value={smtp.utilisateur} onChange={(e) => setSmtp({ ...smtp, utilisateur: e.target.value })} placeholder="moi@exemple.fr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Mot de passe d'application</span>
            <input className={inputCls} type="password" value={smtp.mot_de_passe} onChange={(e) => setSmtp({ ...smtp, mot_de_passe: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Nom de l'expéditeur</span>
            <input className={inputCls} value={smtp.expediteur_nom} onChange={(e) => setSmtp({ ...smtp, expediteur_nom: e.target.value })} placeholder="Jean Martin" />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => void enregistrerSmtp()}
            disabled={smtpEnCours}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
          >
            Enregistrer
          </button>
          <button
            onClick={() => void testerSmtp()}
            disabled={smtpEnCours || !smtp.host.trim()}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {smtpEnCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Tester la connexion
          </button>
        </div>
        {smtpMsg && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{smtpMsg}</p>}
      </div>

      {/* Données : import / export / sauvegarde */}
      <div className={cardCls}>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Database className="h-4 w-4 text-primary-500" /> Données
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            onClick={() => void executer('export', () => ipc.data.exportCsv())}
            disabled={dataEnCours !== null}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {dataEnCours === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileOutput className="h-4 w-4" />}
            Exporter en CSV
          </button>
          <button
            onClick={() => void executer('import', async () => {
              const prev = await ipc.data.importPreview()
              if (!prev || prev.nbLignes === 0) {
                return prev?.erreur ?? 'Aucune ligne exploitable (ou boîte annulée).'
              }
              const conf = confirm(
                `${prev.nbLignes} baux détectés (ex : ${prev.apercu[0]?.locataire ?? ''} — ${prev.apercu[0]?.designation ?? ''}).

` +
                  'Importer maintenant ? (refusé si la base contient déjà des baux)'
              )
              if (!conf) return 'Import annulé.'
              const r = await ipc.data.importCommit()
              return `Import réussi : ${r.baux} baux, ${r.biens} biens, ${r.locataires} locataires (${r.ignores} lignes ignorées).`
            })}
            disabled={dataEnCours !== null}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {dataEnCours === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileInput className="h-4 w-4" />}
            Importer un tableur (CSV)
          </button>
          <button
            onClick={() => void executer('backup', () => ipc.data.backupCreate())}
            disabled={dataEnCours !== null}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {dataEnCours === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Sauvegarder la base
          </button>
          <button
            onClick={() => void lancerAudit()}
            disabled={auditEnCours}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {auditEnCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
            Auditer mes données
          </button>
          <button
            onClick={() => {
              if (confirm('Restaurer une sauvegarde remplacera TOUTES vos données actuelles (une copie de sécurité sera faite). Continuer ?')) {
                void executer('restore', () => ipc.data.backupRestore().then((ok) => (ok ? 'Restauration en cours, redémarrage…' : 'Restauration annulée.')))
              }
            }}
            disabled={dataEnCours !== null}
            className="flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            {dataEnCours === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Restaurer une sauvegarde
          </button>
        </div>
        {dataMsg && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{dataMsg}</p>}
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
