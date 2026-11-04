// ============================================================================
// Contrat de location PRÉ-REMPLI (modèle indicatif, loi du 6 juillet 1989).
// Génère un bail nu/meublé rempli depuis la fiche : parties, désignation du
// bien, durée, loyer + jour de paiement (échéancier réel), dépôt de garantie,
// révision IRL. Le document reste un MODÈLE : le bailleur le relit, l'adapte
// et le fait valider — GestyLoc n'est pas un rédacteur juridique.
// ============================================================================

import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import type { BienLocationRow } from '@shared/types'
import type { ProfilBailleur } from './recu.service'

export interface ContratParams {
  row: BienLocationRow
  bailleur: ProfilBailleur | null
}

const euro = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const fr = (iso: string | null): string => (iso ? iso.split('-').reverse().join('/') : '…')

/** Construit la définition PDF du contrat de location. */
export function construireContrat(params: ContratParams): TDocumentDefinitions {
  const { row, bailleur } = params
  const { bail, bien, locataire } = row
  const dureeJours = bien.meuble ? 1 : 3 // nu : 3 ans — meublé : 1 an (loi 1989)
  const adresseBailleur = [bailleur?.adresse, bailleur?.code_postal, bailleur?.ville]
    .filter(Boolean)
    .join(', ')
  const adresseLocataire = [locataire.adresse, locataire.code_postal, locataire.ville]
    .filter(Boolean)
    .join(', ')
  const adresseBien = [bien.adresse, bien.code_postal, bien.ville].filter(Boolean).join(', ')
  const loyerHc = bail.loyer_hc ?? 0
  const charges = bail.charges ?? 0
  const cc = bail.loyer_cc ?? loyerHc + charges

  const article = (titre: string, corps: string[]): Content[] => [
    { text: titre, bold: true, margin: [0, 16, 0, 6] },
    ...corps.map((c): Content => ({ text: c, margin: [0, 0, 0, 6] }))
  ]

  return {
    content: [
      {
        text: `CONTRAT DE LOCATION${bien.meuble ? ' — LOCAL MEUBLÉ' : ' D’HABITATION'} (bail de ${dureeJours} an${dureeJours > 1 ? 's' : ''})`,
        style: 'titre',
        margin: [0, 0, 0, 4]
      },
      {
        text: 'Modèle pré-rempli par GestyLoc — indicatif, à adapter et compléter selon votre situation (conforme à la loi n° 89-462 du 6 juillet 1989).',
        style: 'note',
        margin: [0, 0, 0, 18]
      },

      // ---- Parties ----
      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'LE BAILLEUR', style: 'etiquette' },
              { text: bailleur?.nom_complet || '________________', bold: true },
              { text: adresseBailleur || '________________' }
            ]
          },
          {
            width: '50%',
            stack: [
              { text: 'LE LOCATAIRE', style: 'etiquette' },
              { text: locataire.nom_complet, bold: true },
              { text: adresseLocataire || '________________' }
            ]
          }
        ],
        margin: [0, 0, 0, 8]
      },

      // ---- Articles ----
      ...article('Article 1 — Désignation du bien loué', [
        `Le bailleur donne en location : ${bien.type_bien} « ${bien.designation} »${bien.nom ? ` (${bien.nom})` : ''}, situé ${adresseBien || 'adresse à compléter'}.`,
        `Surface habitable : ${bien.surface_m2 ? `${bien.surface_m2.toLocaleString('fr-FR')} m²` : 'à compléter'}. Local ${bien.meuble ? 'meublé' : 'nu'}.`,
        `Classe énergétique (DPE) : ${bien.dpe ?? 'à compléter'}.`
      ]),

      ...article('Article 2 — Durée du bail', [
        `Le présent bail est conclu pour une durée de ${dureeJours} an${dureeJours > 1 ? 's' : ''}, du ${fr(bail.date_debut_bail)} au ${fr(bail.date_fin_bail)}${bail.date_fin_bail ? '' : ' (date à compléter : minimum légal)'}.`,
        `Renouvellement/reconduction selon les conditions de la loi du 6 juillet 1989.`
      ]),

      ...article('Article 3 — Loyer et charges', [
        `Loyer mensuel hors charges : ${euro(loyerHc)}.`,
        `Charges ${bail.type_charges ?? '(à préciser : forfaitaires ou provisionnelles)'} : ${euro(charges)} par mois.`,
        `Montant mensuel charges comprises : ${euro(cc)}.`,
        `Le loyer est payable le ${bail.jour_paiement ?? 1} de chaque mois${(bail.jour_paiement ?? 1) > 1 ? ' (jour de paiement convenu entre les parties)' : ''}.`,
        `La première mensualité est due au prorata des jours d'occupation si l'entrée dans les lieux intervient en cours de mois.`
      ]),

      ...article('Article 4 — Dépôt de garantie', [
        bail.depot_garantie
          ? `Un dépôt de garantie de ${euro(bail.depot_garantie)} a été versé par le locataire, restituable dans les conditions légales à la fin du bail (déduction faite, le cas échéant, des sommes restant dues).`
          : 'Dépôt de garantie : non renseigné / aucun.'
      ]),

      ...article('Article 5 — Révision annuelle du loyer', [
        bail.trimestre_reference
          ? `Le loyer est révisé une fois par an, à la date anniversaire du bail, en suivant la variation de l'indice de référence des loyers (IRL) publié par l'INSEE — trimestre de référence : ${bail.trimestre_reference}${bail.irl_reference ? ` (valeur : ${bail.irl_reference})` : ''}.`
          : `Le loyer est révisé une fois par an à la date anniversaire du bail, suivant l'IRL de l'INSEE (trimestre de référence à compléter).`,
        `À défaut de révision dans l'année, le loyer reste au niveau précédent.`
      ]),

      ...article('Article 6 — Documents annexés au contrat', [
        '— Dossier de diagnostic technique (DPE, dont classe énergétique) ;',
        '— État des lieux d’entrée établi contradictoirement ;',
        '— Notice d’information relative aux droits et obligations des parties ;',
        bien.meuble
          ? '— Inventaire du mobilier et liste des équipements.'
          : '— Règlement de copropriété le cas échéant.'
      ]),

      // ---- Signatures ----
      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'Signature du bailleur', style: 'etiquette' },
              { text: '« Lu et approuvé »', margin: [0, 0, 0, 0] },
              { text: bailleur?.nom_complet || '________________', margin: [0, 24, 0, 0] }
            ]
          },
          {
            width: '50%',
            stack: [
              { text: 'Signature du locataire', style: 'etiquette' },
              { text: '« Lu et approuvé »', margin: [0, 0, 0, 0] },
              { text: locataire.nom_complet, margin: [0, 24, 0, 0] }
            ]
          }
        ],
        margin: [0, 30, 0, 0]
      },

      {
        text: 'Fait à ____________________, le ____________________, en deux exemplaires originaux.',
        margin: [0, 24, 0, 0],
        style: 'note'
      }
    ],
    styles: {
      titre: { fontSize: 14, bold: true, alignment: 'center' },
      note: { fontSize: 8, italics: true, color: '#999999' },
      etiquette: { fontSize: 9, color: '#888888', margin: [0, 0, 0, 2] }
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.35 }
  }
}
