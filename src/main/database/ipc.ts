import { ipcMain } from 'electron'
import log from 'electron-log'
import { bienRepository } from '../repositories/bien.repository'
import { locataireRepository } from '../repositories/locataire.repository'
import { bailRepository } from '../repositories/bail.repository'
import { paiementRepository } from '../repositories/paiement.repository'
import { documentsService } from '../services/documents.service'
import { computeAlertes } from '../services/alertes.service'
import { saveQuittancePdf } from '../services/quittance.service'
import type {
  CreateBienInput,
  CreateLocataireInput,
  CreateBailInput,
  CreatePaiementInput,
  TypeDocument
} from '@shared/types'

/**
 * Enveloppe les handlers IPC : transforme les erreurs (exceptions) en
 * valeurs sérialisables { ok, data | error } pour le renderer.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, async (_event, ...args: any[]) => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error(`IPC ${channel} a échoué :`, err)
      return { ok: false, error: message }
    }
  })
}

/**
 * Registre des handlers IPC liés à la base de données et aux services.
 * Convention de canal : db:<entité>:<action>, docs:<action>, quittance:<action>
 */
export function registerDatabaseHandlers(): void {
  // ---------- Vue agrégée (tableau principal = tableur) ----------
  handle('db:locations:list', () => bailRepository.listWithRelations())

  // ---------- Alertes dashboard ----------
  handle('db:alertes', () => computeAlertes(bailRepository.listWithRelations()))

  // ---------- Biens ----------
  handle('db:biens:list', () => bienRepository.list())
  handle('db:biens:get', (id: number) => bienRepository.getById(id))
  handle('db:biens:create', (input: CreateBienInput) => bienRepository.create(input))
  handle('db:biens:update', (id: number, input: CreateBienInput) =>
    bienRepository.update(id, input)
  )
  handle('db:biens:delete', (id: number) => bienRepository.delete(id))

  // ---------- Locataires ----------
  handle('db:locataires:list', () => locataireRepository.list())
  handle('db:locataires:get', (id: number) => locataireRepository.getById(id))
  handle('db:locataires:create', (input: CreateLocataireInput) =>
    locataireRepository.create(input)
  )
  handle('db:locataires:update', (id: number, input: CreateLocataireInput) =>
    locataireRepository.update(id, input)
  )
  handle('db:locataires:delete', (id: number) => locataireRepository.delete(id))

  // ---------- Baux ----------
  handle('db:baux:list', () => bailRepository.list())
  handle('db:baux:get', (id: number) => bailRepository.getById(id))
  handle('db:baux:create', (input: CreateBailInput) => bailRepository.create(input))
  handle('db:baux:update', (id: number, input: CreateBailInput) =>
    bailRepository.update(id, input)
  )
  handle('db:baux:delete', (id: number) => bailRepository.delete(id))

  // ---------- Paiements ----------
  handle('db:paiements:by-bail', (bailId: number) => paiementRepository.listByBail(bailId))
  handle('db:paiements:all', () => paiementRepository.listAll())
  handle('db:paiements:upsert', (input: CreatePaiementInput) =>
    paiementRepository.upsert(input)
  )
  handle('db:paiements:delete', (bailId: number, periode: string) =>
    paiementRepository.delete(bailId, periode)
  )

  // ---------- Documents ----------
  handle('docs:attach', async (bailId: number, type: TypeDocument) =>
    documentsService.selectAndAttach(bailId, type)
  )
  handle('docs:list', (bailId: number) => documentsService.listByBail(bailId))
  handle('docs:list-all', () => documentsService.listAll())
  handle('docs:open', (id: number) => documentsService.open(id))
  handle('docs:delete', (id: number) => documentsService.delete(id))

  // ---------- Quittances PDF ----------
  handle('quittance:save', (base64: string, nomFichier: string) =>
    saveQuittancePdf(base64, nomFichier)
  )
}
