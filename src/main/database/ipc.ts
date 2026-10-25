import { ipcMain } from 'electron'
import log from 'electron-log'
import { bienRepository } from '../repositories/bien.repository'
import { locataireRepository } from '../repositories/locataire.repository'
import { bailRepository } from '../repositories/bail.repository'
import { paiementRepository } from '../repositories/paiement.repository'
import { parametresRepository, type BailleurProfile } from '../repositories/parametres.repository'
import { depenseRepository } from '../repositories/depense.repository'
import { regularisationRepository } from '../repositories/regularisation.repository'
import type { CreateDepenseInput } from '@shared/types'
import { documentsService } from '../services/documents.service'
import { computeAlertes } from '../services/alertes.service'
import {
  saveQuittancePdf,
  choisirDossierQuittances,
  saveToDossier,
  saveToDossierTrace,
  listQuittances,
  enregistrerQuittance
} from '../services/quittance.service'
import { exporterCsv, creerSauvegarde, restaurerSauvegarde } from '../services/donnees.service'
import { previewImport, commitImport } from '../services/import.service'
import { recupererIndices, type TypeIndice } from '../services/indices.service'
import {
  getSmtpConfigPublic,
  saveSmtpConfig,
  testerSmtp,
  envoyerEmail
} from '../services/email.service'
import type { SmtpConfig } from '@shared/types'
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

  // ---------- Dépenses (module patrimonial) ----------
  handle('db:depenses:list', () => depenseRepository.list())
  handle('db:depenses:by-bien', (bienId: number) => depenseRepository.listByBien(bienId))
  handle('db:depenses:create', (input: CreateDepenseInput) => depenseRepository.create(input))
  handle('db:depenses:update', (id: number, input: CreateDepenseInput) => depenseRepository.update(id, input))
  handle('db:depenses:delete', (id: number) => depenseRepository.delete(id))

  // ---------- Régularisation des charges ----------
  handle('db:regularisations:list', () => regularisationRepository.list())
  handle('db:regularisations:upsert', (bailId: number, annee: number, chargesReelles: number) =>
    regularisationRepository.upsert(bailId, annee, chargesReelles)
  )

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
  handle('docs:attach-to-bien', async (bienId: number, type: TypeDocument) =>
    documentsService.selectAndAttachToBien(bienId, type)
  )
  handle('docs:list-by-bien', (bienId: number) => documentsService.listByBien(bienId))
  handle('docs:open', (id: number) => documentsService.open(id))
  handle('docs:delete', (id: number) => documentsService.delete(id))

  // ---------- Paramètres (profil bailleur, préférences) ----------
  handle('db:parametres:get', (cle: string) => parametresRepository.get(cle))
  handle('db:parametres:set', (cle: string, valeur: unknown) =>
    parametresRepository.set(cle, valeur)
  )
  handle('db:parametres:get-bailleur', () => parametresRepository.getBailleur())
  handle('db:parametres:set-bailleur', (profil: BailleurProfile) =>
    parametresRepository.setBailleur(profil)
  )

  // ---------- Quittances PDF ----------
  handle(
    'quittance:save',
    (base64: string, nomFichier: string, bailId?: number, periode?: string) =>
      saveQuittancePdf(base64, nomFichier).then((chemin) => {
        if (chemin && bailId && periode) enregistrerQuittance(bailId, periode, nomFichier, chemin)
        return chemin
      })
  )
  handle('quittance:choose-folder', () => choisirDossierQuittances())
  handle(
    'quittance:save-to',
    (base64: string, dossier: string, nomFichier: string, bailId?: number, periode?: string) =>
      bailId && periode
        ? saveToDossierTrace(base64, dossier, nomFichier, bailId, periode)
        : saveToDossier(base64, dossier, nomFichier)
  )
  handle('quittances:list', () => listQuittances())

  // ---------- Données : import / export / sauvegarde ----------
  handle('data:export-csv', () => exporterCsv())
  handle('data:backup-create', () => creerSauvegarde())
  handle('data:backup-restore', () => restaurerSauvegarde())
  handle('data:import-preview', () => previewImport())
  handle('data:import-commit', () => commitImport())

  // ---------- Indices INSEE (IRL / ICC) ----------
  handle('indices:fetch', (type: TypeIndice) => recupererIndices(type))

  // ---------- Email (SMTP configuré par l'utilisateur) ----------
  handle('email:get-config', () => getSmtpConfigPublic())
  handle('email:save-config', (cfg: SmtpConfig) => saveSmtpConfig(cfg))
  handle('email:test', () => testerSmtp())
  handle(
    'email:send',
    (destinataire: string, sujet: string, corps: string, pieceJointe?: { nomFichier: string; base64: string }) =>
      envoyerEmail(destinataire, sujet, corps, pieceJointe)
  )
}
