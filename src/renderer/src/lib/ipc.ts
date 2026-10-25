import type {
  Depense,
  CreateDepenseInput,
  QuittanceHistorique,
  RegularisationCharges,
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
    attachToBien: (bienId: number, type: TypeDocument): Promise<DocumentRow | null> =>
      unwrap(window.api.docs.attachToBien(bienId, type)),
    listByBien: (bienId: number): Promise<DocumentRow[]> =>
      unwrap(window.api.docs.listByBien(bienId)),
    open: (id: number): Promise<boolean> => unwrap(window.api.docs.open(id)),
    remove: (id: number): Promise<void> => unwrap(window.api.docs.remove(id))
  },
  depenses: {
    list: (): Promise<Depense[]> => unwrap(window.api.db.listDepenses() as Promise<
      { ok: boolean; data?: Depense[]; error?: string }
    >),
    create: (input: CreateDepenseInput): Promise<Depense> =>
      unwrap(window.api.db.createDepense(input) as Promise<
        { ok: boolean; data?: Depense; error?: string }
      >),
    update: (id: number, input: Partial<CreateDepenseInput>): Promise<Depense> =>
      unwrap(window.api.db.updateDepense(id, input) as Promise<
        { ok: boolean; data?: Depense; error?: string }
      >),
    remove: (id: number): Promise<void> =>
      unwrap(window.api.db.deleteDepense(id) as Promise<{ ok: boolean; error?: string }>)
  },
  email: {
    getConfig: (): Promise<{
      configure: boolean
      host: string
      port: number
      secure: boolean
      utilisateur: string
      expediteur_nom: string
    }> =>
      unwrap(window.api.email.getConfig() as Promise<{
        ok: boolean
        data?: {
          configure: boolean
          host: string
          port: number
          secure: boolean
          utilisateur: string
          expediteur_nom: string
        }
        error?: string
      }>),
    saveConfig: (cfg: {
      host: string
      port: number
      secure: boolean
      utilisateur: string
      mot_de_passe: string
      expediteur_nom: string
    }): Promise<void> =>
      unwrap(window.api.email.saveConfig(cfg) as Promise<{ ok: boolean; error?: string }>),
    test: (): Promise<boolean> =>
      unwrap(window.api.email.test() as Promise<{ ok: boolean; error?: string }>),
    send: (
      destinataire: string,
      sujet: string,
      corps: string,
      pieceJointe?: { nomFichier: string; base64: string }
    ): Promise<void> =>
      unwrap(window.api.email.send(destinataire, sujet, corps, pieceJointe) as Promise<{
        ok: boolean
        error?: string
      }>)
  },
  regularisations: {
    list: (): Promise<RegularisationCharges[]> =>
      unwrap(window.api.db.listRegularisations() as Promise<{
        ok: boolean
        data?: RegularisationCharges[]
        error?: string
      }>),
    upsert: (bailId: number, annee: number, chargesReelles: number): Promise<void> =>
      unwrap(window.api.db.upsertRegularisation(bailId, annee, chargesReelles) as Promise<{
        ok: boolean
        error?: string
      }>)
  },
  indices: {
    fetchHistory: (
      type: 'IRL' | 'ICC'
    ): Promise<{ valeurs: { periode: string; valeur: number }[]; erreur: string | null }> =>
      unwrap(window.api.indices.history(type) as Promise<{
        ok: boolean
        data?: { valeurs: { periode: string; valeur: number }[]; erreur: string | null }
        error?: string
      }>),
    fetch: (
      type: 'IRL' | 'ICC'
    ): Promise<{
      type: 'IRL' | 'ICC'
      titre: string
      valeurs: { periode: string; valeur: number }[]
      erreur: string | null
    }> =>
      unwrap(window.api.indices.fetch(type) as Promise<{
        ok: boolean
        data?: {
          type: 'IRL' | 'ICC'
          titre: string
          valeurs: { periode: string; valeur: number }[]
          erreur: string | null
        }
        error?: string
      }>)
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
    save: (
      base64: string,
      nomFichier: string,
      bailId?: number,
      periode?: string
    ): Promise<string | null> =>
      unwrap(window.api.quittances.save(base64, nomFichier, bailId, periode)),
    chooseFolder: (): Promise<string | null> => unwrap(window.api.quittances.chooseFolder()),
    saveTo: (
      base64: string,
      dossier: string,
      nomFichier: string,
      bailId?: number,
      periode?: string
    ): Promise<string> =>
      unwrap(window.api.quittances.saveTo(base64, dossier, nomFichier, bailId, periode)),
    list: (): Promise<QuittanceHistorique[]> =>
      unwrap(window.api.quittances.list() as Promise<{
        ok: boolean
        data?: QuittanceHistorique[]
        error?: string
      }>)
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
