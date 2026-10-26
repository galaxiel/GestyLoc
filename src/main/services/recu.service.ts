// ============================================================================
// Reçu de paiement (paiement partiel) — art. 21 loi 1989 : la quittance
// atteste un paiement intégral ; pour un paiement partiel, le bailleur
// délivre un RECEU. Génération côté main avec pdfmake (côté node).
// ============================================================================

import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { BienLocationRow } from '@shared/types'

export interface RecuParams {
  row: BienLocationRow
  bailleur: string
  adresseBailleur: string
  periode: string // 'yyyy-mm'
  montantRecu: number
  modePaiement: string | null
}

/** Construit la définition du reçu pour paiement partiel. */
export function construireRecu(params: RecuParams): TDocumentDefinitions {
  const { row, bailleur, adresseBailleur, periode, montantRecu, modePaiement } = params
  const { bail, bien, locataire } = row
  const attendu = bail.loyer_cc ?? (bail.loyer_hc ?? 0) + (bail.charges ?? 0)
  const reste = Math.round((attendu - montantRecu) * 100) / 100
  const aujourdhui = new Date().toLocaleDateString('fr-FR')
  const [annee, mois] = periode.split('-')
  const libellePeriode = new Date(Number(annee), Number(mois) - 1, 1).toLocaleDateString(
    'fr-FR',
    { month: 'long', year: 'numeric' }
  )

  return {
    content: [
      { text: 'REÇU DE PAIEMENT (PARTIEL)', style: 'titre' },
      { text: 'Loyer de logement — article 21 de la loi du 6 juillet 1989', style: 'sousTitre', margin: [0, 0, 0, 20] },

      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'BAILLEUR', style: 'etiquette' },
              { text: bailleur, bold: true },
              { text: adresseBailleur }
            ]
          },
          {
            width: '50%',
            stack: [
              { text: 'LOCATAIRE', style: 'etiquette' },
              { text: locataire.nom_complet, bold: true },
              { text: [bien.adresse, bien.code_postal, bien.ville].filter(Boolean).join(', ') }
            ]
          }
        ],
        margin: [0, 0, 0, 16]
      },

      {
        text: `Je soussigné(e) ${bailleur}, bailleur du logement désigné ci-dessus, déclare avoir reçu de ${locataire.nom_complet} un PAIEMENT PARTIEL du loyer et des charges pour la période de ${libellePeriode} :`
      },

      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [{ text: 'Désignation', bold: true }, { text: 'Montant', bold: true, alignment: 'right' }],
            ['Loyer et charges attendus (CC)', { text: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(attendu), alignment: 'right' }],
            ['Montant reçu' + (modePaiement ? ` (${modePaiement})` : ''), { text: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(montantRecu), alignment: 'right' }],
            [
              { text: 'RESTE DÛ', bold: true },
              { text: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(reste), bold: true, alignment: 'right' }
            ]
          ]
        },
        margin: [0, 10, 0, 16]
      },

      {
        text: `Ce reçu ne vaut pas quittance : la quittance définitive sera délivrée dès le règlement du solde. Le locataire peut s'acquitter du reste dû ${reste > 0 ? 'par versement complémentaire' : ''}. Cette attestation est délivrée gratuitement.`,
        style: 'note'
      },

      {
        columns: [
          { width: '50%', stack: [{ text: `Fait le ${aujourdhui}`, margin: [0, 30, 0, 0] }] },
          {
            width: '50%',
            alignment: 'right',
            stack: [{ text: 'Signature du bailleur', style: 'etiquette', margin: [0, 30, 0, 0] }]
          }
        ]
      }
    ],
    styles: {
      titre: { fontSize: 16, bold: true, alignment: 'center' },
      sousTitre: { fontSize: 9, italics: true, alignment: 'center', color: '#666666' },
      etiquette: { fontSize: 9, color: '#888888', margin: [0, 0, 0, 2] },
      note: { fontSize: 9, italics: true, color: '#666666' }
    },
    defaultStyle: { font: 'Roboto', fontSize: 10 }
  }
}
