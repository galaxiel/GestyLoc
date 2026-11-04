import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  Bien,
  Locataire,
  Bail,
  BienLocationRow,
  CreateBienInput,
  CreateLocataireInput,
  CreateBailInput,
  Paiement,
  CreatePaiementInput,
  DocumentRow,
  Alerte,
  TypeDocument
} from '@shared/types'

// ============================================================================
// API exposée au renderer (React) via contextBridge.
// SEUL ce qui est déclaré ici est accessible depuis window.api — l'objet
// « electron » (electronAPI) n'est volontairement PLUS exposé : il donnait au
// renderer un ipcRenderer brut sur TOUS les canaux (contournement de cette
// liste blanche en cas de XSS). Tout appel passe par api ci-dessous.
// ============================================================================

// Résultat standardisé de chaque appel IPC vers la BDD.
export interface IpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}

const api = {
  // ---- Auto-updater ----
  updater: {
    check: (): Promise<unknown> => ipcRenderer.invoke('updater:check'),
    download: (): Promise<void> => ipcRenderer.invoke('updater:download'),
    install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    // S'abonner aux évènements updater. Le listener reçoit directement le
    // payload (args[0]), pas l'event IPC brut.
    on: (channel: string, listener: (payload: unknown) => void): (() => void) => {
      const wrapped = (_event: IpcRendererEvent, ...args: unknown[]): void => listener(args[0])
      ipcRenderer.on(channel, wrapped)
      return () => ipcRenderer.removeListener(channel, wrapped)
    }
  },

  // ---- Base de données ----
  db: {
    // Vue agrégée (tableau principal = ligne du tableur)
    listLocations: (): Promise<IpcResult<BienLocationRow[]>> =>
      ipcRenderer.invoke('db:locations:list'),

    // Alertes dashboard
    getAlertes: (): Promise<IpcResult<Alerte[]>> => ipcRenderer.invoke('db:alertes'),

    // Biens
    listBiens: (): Promise<IpcResult<Bien[]>> => ipcRenderer.invoke('db:biens:list'),
    createBien: (input: CreateBienInput): Promise<IpcResult<Bien>> =>
      ipcRenderer.invoke('db:biens:create', input),
    updateBien: (id: number, input: Partial<CreateBienInput>): Promise<IpcResult<Bien>> =>
      ipcRenderer.invoke('db:biens:update', id, input),
    deleteBien: (id: number): Promise<IpcResult<void>> => ipcRenderer.invoke('db:biens:delete', id),

    // Locataires
    listLocataires: (): Promise<IpcResult<Locataire[]>> => ipcRenderer.invoke('db:locataires:list'),
    createLocataire: (input: CreateLocataireInput): Promise<IpcResult<Locataire>> =>
      ipcRenderer.invoke('db:locataires:create', input),
    updateLocataire: (
      id: number,
      input: Partial<CreateLocataireInput>
    ): Promise<IpcResult<Locataire>> => ipcRenderer.invoke('db:locataires:update', id, input),
    deleteLocataire: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('db:locataires:delete', id),

    // Baux
    listBaux: (): Promise<IpcResult<Bail[]>> => ipcRenderer.invoke('db:baux:list'),
    createBail: (input: CreateBailInput): Promise<IpcResult<Bail>> =>
      ipcRenderer.invoke('db:baux:create', input),
    updateBail: (id: number, input: Partial<CreateBailInput>): Promise<IpcResult<Bail>> =>
      ipcRenderer.invoke('db:baux:update', id, input),
    deleteBail: (id: number): Promise<IpcResult<void>> => ipcRenderer.invoke('db:baux:delete', id),

    // Révisions de loyer (historique, migration 0012)
    listRevisions: (bailId: number): Promise<IpcResult<unknown[]>> =>
      ipcRenderer.invoke('db:revisions:list', bailId),
    listAllRevisions: (): Promise<IpcResult<unknown[]>> =>
      ipcRenderer.invoke('db:revisions:list-all'),
    createRevision: (input: unknown): Promise<IpcResult<unknown>> =>
      ipcRenderer.invoke('db:revisions:create', input),

    // Dépenses (patrimoine)
    listDepenses: (): Promise<IpcResult<unknown[]>> => ipcRenderer.invoke('db:depenses:list'),
    listDepensesByBien: (bienId: number): Promise<IpcResult<unknown[]>> =>
      ipcRenderer.invoke('db:depenses:by-bien', bienId),
    createDepense: (input: unknown): Promise<IpcResult<unknown>> =>
      ipcRenderer.invoke('db:depenses:create', input),
    updateDepense: (id: number, input: unknown): Promise<IpcResult<unknown>> =>
      ipcRenderer.invoke('db:depenses:update', id, input),
    deleteDepense: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('db:depenses:delete', id),

    // Régularisation des charges
    listRegularisations: (): Promise<IpcResult<unknown[]>> =>
      ipcRenderer.invoke('db:regularisations:list'),
    upsertRegularisation: (
      bailId: number,
      annee: number,
      chargesReelles: number
    ): Promise<IpcResult<unknown>> =>
      ipcRenderer.invoke('db:regularisations:upsert', bailId, annee, chargesReelles),

    // Paiements (suivi loyers)
    listPaiementsByBail: (bailId: number): Promise<IpcResult<Paiement[]>> =>
      ipcRenderer.invoke('db:paiements:by-bail', bailId),
    listPaiements: (): Promise<IpcResult<Paiement[]>> => ipcRenderer.invoke('db:paiements:all'),
    upsertPaiement: (input: CreatePaiementInput): Promise<IpcResult<Paiement>> =>
      ipcRenderer.invoke('db:paiements:upsert', input),
    deletePaiement: (bailId: number, periode: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('db:paiements:delete', bailId, periode)
  },

  // ---- Paramètres (profil bailleur, préférences) ----
  parametres: {
    get: (cle: string): Promise<IpcResult<unknown>> => ipcRenderer.invoke('db:parametres:get', cle),
    set: (cle: string, valeur: unknown): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('db:parametres:set', cle, valeur),
    getBailleur: (): Promise<IpcResult<unknown>> =>
      ipcRenderer.invoke('db:parametres:get-bailleur'),
    setBailleur: (profil: unknown): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('db:parametres:set-bailleur', profil)
  },

  // ---- Documents (pièces jointes) ----
  docs: {
    attach: (bailId: number, type: TypeDocument): Promise<IpcResult<DocumentRow | null>> =>
      ipcRenderer.invoke('docs:attach', bailId, type),
    list: (bailId: number): Promise<IpcResult<DocumentRow[]>> =>
      ipcRenderer.invoke('docs:list', bailId),
    listAll: (): Promise<IpcResult<DocumentRow[]>> => ipcRenderer.invoke('docs:list-all'),
    attachToBien: (bienId: number, type: TypeDocument): Promise<IpcResult<DocumentRow | null>> =>
      ipcRenderer.invoke('docs:attach-to-bien', bienId, type),
    listByBien: (bienId: number): Promise<IpcResult<DocumentRow[]>> =>
      ipcRenderer.invoke('docs:list-by-bien', bienId),
    open: (id: number): Promise<IpcResult<boolean>> => ipcRenderer.invoke('docs:open', id),
    remove: (id: number): Promise<IpcResult<void>> => ipcRenderer.invoke('docs:delete', id)
  },

  // ---- Quittances PDF ----
  quittances: {
    save: (
      base64: string,
      nomFichier: string,
      bailId?: number,
      periode?: string,
      reference?: string
    ): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke('quittance:save', base64, nomFichier, bailId, periode, reference),
    chooseFolder: (): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke('quittance:choose-folder'),
    saveTo: (
      base64: string,
      dossier: string,
      nomFichier: string,
      bailId?: number,
      periode?: string,
      reference?: string
    ): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(
        'quittance:save-to',
        base64,
        dossier,
        nomFichier,
        bailId,
        periode,
        reference
      ),
    list: (): Promise<IpcResult<unknown[]>> => ipcRenderer.invoke('quittances:list')
  },

  // ---- Reçu de paiement partiel (définition PDF générée côté main) ----
  recu: {
    pdf: (params: unknown): Promise<IpcResult<unknown>> => ipcRenderer.invoke('recu:pdf', params)
  },

  // ---- Contrat de location pré-rempli (définition PDF générée côté main) ----
  contrat: {
    pdf: (params: unknown): Promise<IpcResult<unknown>> => ipcRenderer.invoke('contrat:pdf', params)
  },

  // ---- Audit des données ----
  audit: {
    run: (): Promise<IpcResult<unknown>> => ipcRenderer.invoke('data:audit')
  },

  // ---- Indices INSEE (IRL / ICC) ----
  indices: {
    fetch: (type: string): Promise<IpcResult<unknown>> => ipcRenderer.invoke('indices:fetch', type),
    history: (type: string): Promise<IpcResult<unknown>> =>
      ipcRenderer.invoke('indices:history', type)
  },

  // ---- Email (SMTP) ----
  email: {
    getConfig: (): Promise<IpcResult<unknown>> => ipcRenderer.invoke('email:get-config'),
    saveConfig: (cfg: unknown): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('email:save-config', cfg),
    test: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke('email:test'),
    send: (
      destinataire: string,
      sujet: string,
      corps: string,
      pieceJointe?: { nomFichier: string; base64: string }
    ): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('email:send', destinataire, sujet, corps, pieceJointe)
  },

  // ---- Infos app ----
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
    getDbPath: (): Promise<IpcResult<string>> => ipcRenderer.invoke('app:get-db-path'),
    openDataFolder: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke('app:open-data-folder')
  },

  // ---- Données : import / export / sauvegarde ----
  data: {
    exportCsv: (): Promise<IpcResult<string | null>> => ipcRenderer.invoke('data:export-csv'),
    backupCreate: (): Promise<IpcResult<string | null>> => ipcRenderer.invoke('data:backup-create'),
    backupRestore: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke('data:backup-restore'),
    importPreview: (): Promise<IpcResult<unknown>> => ipcRenderer.invoke('data:import-preview'),
    importCommit: (): Promise<IpcResult<unknown>> => ipcRenderer.invoke('data:import-commit')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (défini dans index.d.ts) — cas non isolé, jamais vu en prod
  window.api = api
}

export type AppApi = typeof api
