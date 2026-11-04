// ============================================================================
// Relances d'impayés — templates d'emails/lettres, fonctions PURES (testées).
// Trois niveaux (pratique d'art) :
//   1. courtoise  — J+qq jours : « sauf erreur, pas encore reçu »
//   2. ferme      — récidive : « régulariser sous 8 jours »
//   3. mise en demeure — dernier avertissement formel avant procédure
// Le texte est un modèle pré-rempli, jamais un envoi automatique : le
// bailleur relit, ajuste et envoie lui-même.
// ============================================================================

const euro = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export type NiveauRelance = 1 | 2 | 3

export interface CtxRelance {
  locataire: string
  designation: string
  adresseBien: string
  periode: string // libellé « novembre 2026 »
  montantDu: number
  echeance: string // jj/mm/aaaa
  bailleur: string
}

export interface ModeleRelance {
  objet: string
  corps: string
}

/** Libellés affichés dans l'UI (sélecteur de niveau). */
export function libelleNiveau(niveau: NiveauRelance): string {
  return niveau === 1
    ? 'Relance courtoise'
    : niveau === 2
      ? 'Relance ferme (récidive)'
      : 'Mise en demeure'
}

/** Construit l'objet + le corps du message pour un niveau donné. */
export function templateRelance(niveau: NiveauRelance, ctx: CtxRelance): ModeleRelance {
  const { locataire, designation, adresseBien, periode, montantDu, echeance, bailleur } = ctx
  const bien = `${designation}${adresseBien ? ` (${adresseBien})` : ''}`
  if (niveau === 1) {
    return {
      objet: `Rappel — loyer de ${periode}`,
      corps:
        `Bonjour ${locataire},\n\n` +
        `Sauf erreur de notre part, nous n'avons pas encore reçu le loyer du bien ${bien} ` +
        `pour la période de ${periode} (montant attendu : ${euro(montantDu)}, échéance le ${echeance}).\n\n` +
        `Il s'agit probablement d'un simple oubli — merci de procéder au règlement dans les meilleurs délais, ` +
        `ou de nous contacter si un versement a déjà été effectué.\n\n` +
        `Cordialement,\n${bailleur}`
    }
  }
  if (niveau === 2) {
    return {
      objet: `Régularisation nécessaire — loyer de ${periode} impayé`,
      corps:
        `Bonjour ${locataire},\n\n` +
        `Malgré notre précédent rappel, le loyer du bien ${bien} pour la période de ${periode} ` +
        `reste impayé (${euro(montantDu)} dus depuis le ${echeance}).\n\n` +
        `Nous vous demandons de régulariser cette situation sous 8 jours. Au-delà, ` +
        `nous serions contraints d'engager les démarches de recouvrement prévues par le bail.\n\n` +
        `Un paiement partiel est toujours préférable à l'absence de règlement : contactez-nous en cas de difficulté.\n\n` +
        `Cordialement,\n${bailleur}`
    }
  }
  return {
    objet: `Mise en demeure de payer — loyer de ${periode}`,
    corps:
      `${locataire},\n\n` +
      `Malgré nos relances des dates antérieures, le loyer du bien ${bien} pour la période de ${periode} ` +
      `demeure impayé : ${euro(montantDu)} dus depuis le ${echeance}.\n\n` +
      `Nous vous METTIONS EN DEMEURE de régler la somme de ${euro(montantDu)} dans un délai de 8 jours ` +
      `à compter de la réception de ce courrier.\n\n` +
      `À défaut de paiement dans ce délai, nous engagerons sans nouveau délai les procédures de recouvrement ` +
      `et, le cas échéant, la résiliation du bail et la procédure d'expulsion, conformément aux articles ` +
      `du contrat de location et à la loi du 6 juillet 1989.\n\n` +
      `La présente est adressée à titre de mise en demeure — nous vous invitons à y répondre sans attendre.\n\n` +
      `${bailleur}`
  }
}
