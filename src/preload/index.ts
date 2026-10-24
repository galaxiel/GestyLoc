import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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
// SEUL ce qui est déclaré ici est accessible depuis window.api.
// Aucun accès direct à Node.js / fs / require depuis le renderer : c'est la
// garantie de sécurité fondamentale (contextIsolation: true).
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
      const wrapped = (_event: IpcRendererEvent, ...args: unknown[]): void =>
        listener(args[0])
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
    deleteBien: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('db:biens:delete', id),

    // Locataires
    listLocataires: (): Promise<IpcResult<Locataire[]>> =>
      ipcRenderer.invoke('db:locataires:list'),
    createLocataire: (input: CreateLocataireInput): Promise<IpcResult<Locataire>> =>
      ipcRenderer.invoke('db:locataires:create', input),
    updateLocataire: (
      id: number,
      input: Partial<CreateLocataireInput>
    ): Promise<IpcResult<Locataire>> =>
      ipcRenderer.invoke('db:locataires:update', id, input),
    deleteLocataire: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('db:locataires:delete', id),

    // Baux
    listBaux: (): Promise<IpcResult<Bail[]>> => ipcRenderer.invoke('db:baux:list'),
    createBail: (input: CreateBailInput): Promise<IpcResult<Bail>> =>
      ipcRenderer.invoke('db:baux:create', input),
    updateBail: (id: number, input: Partial<CreateBailInput>): Promise<IpcResult<Bail>> =>
      ipcRenderer.invoke('db:baux:update', id, input),
    deleteBail: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('db:baux:delete', id),

    // Paiements (suivi loyers)
    listPaiementsByBail: (bailId: number): Promise<IpcResult<Paiement[]>> =>
      ipcRenderer.invoke('db:paiements:by-bail', bailId),
    listPaiements: (): Promise<IpcResult<Paiement[]>> =>
      ipcRenderer.invoke('db:paiements:all'),
    upsertPaiement: (input: CreatePaiementInput): Promise<IpcResult<Paiement>> =>
      ipcRenderer.invoke('db:paiements:upsert', input),
    deletePaiement: (bailId: number, periode: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('db:paiements:delete', bailId, periode)
  },

  // ---- Paramètres (profil bailleur, préférences) ----
  parametres: {
    get: (cle: string): Promise<IpcResult<unknown>> =>
      ipcRenderer.invoke('db:parametres:get', cle),
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
    open: (id: number): Promise<IpcResult<boolean>> => ipcRenderer.invoke('docs:open', id),
    remove: (id: number): Promise<IpcResult<void>> => ipcRenderer.invoke('docs:delete', id)
  },

  // ---- Quittances PDF ----
  quittances: {
    save: (base64: string, nomFichier: string): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke('quittance:save', base64, nomFichier)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (défini dans index.d.ts)
  window.electron = electronAPI
  // @ts-ignore (défini dans index.d.ts)
  window.api = api
}

export type AppApi = typeof api
