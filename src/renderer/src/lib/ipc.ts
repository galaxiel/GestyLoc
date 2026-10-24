import type {
  BienLocationRow,
  CreateBienInput,
  CreateLocataireInput,
  CreateBailInput,
  CreatePaiementInput,
  Paiement,
  DocumentRow,
  Alerte,
  TypeDocument
} from '@shared/types'

/**
 * Client IPC typé : délègue à window.api et déballe l'enveloppe
 * { ok, data | error } en levant une exception en cas d'erreur.
 * Le renderer ne voit jamais l'enveloppe — juste les données ou une Error.
 */
async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error ?? 'Erreur inconnue')
  return res.data as T
}

export const ipc = {
  locations: {
    list: (): Promise<BienLocationRow[]> => unwrap(window.api.db.listLocations())
  },
  alertes: {
    list: (): Promise<Alerte[]> => unwrap(window.api.db.getAlertes())
  },
  biens: {
    create: (input: CreateBienInput): Promise<unknown> => unwrap(window.api.db.createBien(input)),
    update: (id: number, input: Partial<CreateBienInput>): Promise<unknown> =>
      unwrap(window.api.db.updateBien(id, input)),
    remove: (id: number): Promise<void> => unwrap(window.api.db.deleteBien(id))
  },
  locataires: {
    create: (input: CreateLocataireInput): Promise<unknown> =>
      unwrap(window.api.db.createLocataire(input)),
    update: (id: number, input: Partial<CreateLocataireInput>): Promise<unknown> =>
      unwrap(window.api.db.updateLocataire(id, input)),
    remove: (id: number): Promise<void> => unwrap(window.api.db.deleteLocataire(id))
  },
  baux: {
    create: (input: CreateBailInput): Promise<unknown> => unwrap(window.api.db.createBail(input)),
    update: (id: number, input: Partial<CreateBailInput>): Promise<unknown> =>
      unwrap(window.api.db.updateBail(id, input)),
    remove: (id: number): Promise<void> => unwrap(window.api.db.deleteBail(id))
  },
  paiements: {
    listByBail: (bailId: number): Promise<Paiement[]> =>
      unwrap(window.api.db.listPaiementsByBail(bailId)),
    listAll: (): Promise<Paiement[]> => unwrap(window.api.db.listPaiements()),
    upsert: (input: CreatePaiementInput): Promise<Paiement> =>
      unwrap(window.api.db.upsertPaiement(input)),
    remove: (bailId: number, periode: string): Promise<void> =>
      unwrap(window.api.db.deletePaiement(bailId, periode))
  },
  documents: {
    attach: (bailId: number, type: TypeDocument): Promise<DocumentRow | null> =>
      unwrap(window.api.docs.attach(bailId, type)),
    list: (bailId: number): Promise<DocumentRow[]> => unwrap(window.api.docs.list(bailId)),
    listAll: (): Promise<DocumentRow[]> => unwrap(window.api.docs.listAll()),
    open: (id: number): Promise<boolean> => unwrap(window.api.docs.open(id)),
    remove: (id: number): Promise<void> => unwrap(window.api.docs.remove(id))
  },
  parametres: {
    getBailleur: (): Promise<{ nom_complet: string; adresse: string } | null> =>
      unwrap(window.api.parametres.getBailleur() as Promise<
        { ok: boolean; data?: { nom_complet: string; adresse: string } | null; error?: string }
      >),
    setBailleur: (profil: { nom_complet: string; adresse: string }): Promise<void> =>
      unwrap(window.api.parametres.setBailleur(profil) as Promise<
        { ok: boolean; data?: void; error?: string }
      >)
  },
  quittances: {
    save: (base64: string, nomFichier: string): Promise<string | null> =>
      unwrap(window.api.quittances.save(base64, nomFichier)),
    chooseFolder: (): Promise<string | null> => unwrap(window.api.quittances.chooseFolder()),
    saveTo: (base64: string, dossier: string, nomFichier: string): Promise<string> =>
      unwrap(window.api.quittances.saveTo(base64, dossier, nomFichier))
  },
  data: {
    exportCsv: (): Promise<string | null> => unwrap(window.api.data.exportCsv()),
    backupCreate: (): Promise<string | null> => unwrap(window.api.data.backupCreate()),
    backupRestore: (): Promise<boolean> => unwrap(window.api.data.backupRestore()),
    importPreview: (): Promise<{ nbLignes: number; apercu: { designation: string; type_bien: string; locataire: string; loyer_cc: number | null }[]; erreur: string | null }> =>
      unwrap(window.api.data.importPreview() as Promise<{
        ok: boolean
        data?: { nbLignes: number; apercu: { designation: string; type_bien: string; locataire: string; loyer_cc: number | null }[]; erreur: string | null }
        error?: string
      }>),
    importCommit: (): Promise<{ baux: number; biens: number; locataires: number; ignores: number }> =>
      unwrap(window.api.data.importCommit() as Promise<{
        ok: boolean
        data?: { baux: number; biens: number; locataires: number; ignores: number }
        error?: string
      }>)
  }
}
