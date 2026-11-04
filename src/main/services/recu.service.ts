// ============================================================================
// Reçu de paiement (paiement partiel) — art. 21 loi 1989 : la quittance
// atteste un paiement intégral ; pour un paiement partiel, le bailleur
// délivre un REÇU. Génération côté main avec pdfmake (côté node).
// Refonte (post-v1.15) : adresses complètes structurées bailleur (profil
// rue/CP/ville) et locataire (migration 0009), montant attendu PRORATISÉ
// (échéancier réel), formulation non genrée, « bien » comme la quittance.
// ============================================================================

import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { BienLocationRow } from '@shared/types'
import { montantAttendu } from '@shared/echeancier'

/** Profil bailleur structuré (table parametres, clé 'bailleur'). */
export interface ProfilBailleur {
  nom_complet: string
  adresse: string
  code_postal?: string
  ville?: string
}

export interface RecuParams {
  row: BienLocationRow
  bailleur: ProfilBailleur | null
  periode: string // 'yyyy-mm'
  montantRecu: number
  modePaiement: string | null
}

const euro = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

/** Adresse multi-lignes « rue / CP ville » (lignes vides retirées). */
function lignesAdresse(rue: string | null, cp: string | null, ville: string | null): string[] {
  const cpVille = [cp, ville].filter(Boolean).join(' ').trim()
  return [rue ?? '', cpVille].map((s) => s.trim()).filter(Boolean)
}

/** Construit la définition du reçu pour paiement partiel. */
export function construireRecu(params: RecuParams): TDocumentDefinitions {
  const { row, bailleur, periode, montantRecu, modePaiement } = params
  const { bail, bien, locataire } = row
  // Montant attendu PRORATISÉ au premier mois (échéancier réel) — sinon un
  // locataire entré le 15 afficherait un « reste dû » faux.
  const attendu =
    montantAttendu(bail, periode) ?? bail.loyer_cc ?? (bail.loyer_hc ?? 0) + (bail.charges ?? 0)
  const reste = Math.round((attendu - montantRecu) * 100) / 100
  const aujourdhui = new Date().toLocaleDateString('fr-FR')
  const [annee, mois] = periode.split('-')
  const libellePeriode = new Date(Number(annee), Number(mois) - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric'
  })

  const nomBailleur = bailleur?.nom_complet || '________________'
  const adresseBailleur = lignesAdresse(
    bailleur?.adresse ?? null,
    bailleur?.code_postal ?? null,
    bailleur?.ville ?? null
  )
  // Locataire : adresse personnelle (migration 0009) — sinon celle du bien.
  const adresseLocataire =
    lignesAdresse(locataire.adresse, locataire.code_postal, locataire.ville).length > 0
      ? lignesAdresse(locataire.adresse, locataire.code_postal, locataire.ville)
      : lignesAdresse(bien.adresse, bien.code_postal, bien.ville)
  // « Fait à … » prérempli avec la ville du bailleur (convention quittance v1.14).
  const lieuDate = bailleur?.ville
    ? `Fait à ${bailleur.ville}, le ${aujourdhui}`
    : `Fait le ${aujourdhui}`

  return {
    content: [
      { text: 'REÇU DE PAIEMENT (PARTIEL)', style: 'titre' },
      {
        text: 'Loyer de bien loué — distinct de la quittance (art. 21, loi du 6 juillet 1989)',
        style: 'sousTitre',
        margin: [0, 0, 0, 20]
      },

      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'BAILLEUR', style: 'etiquette' },
              { text: nomBailleur, bold: true },
              ...adresseBailleur.map((l) => ({ text: l }))
            ]
          },
          {
            width: '50%',
            stack: [
              { text: 'LOCATAIRE', style: 'etiquette' },
              { text: locataire.nom_complet, bold: true },
              ...adresseLocataire.map((l) => ({ text: l }))
            ]
          }
        ],
        margin: [0, 0, 0, 16]
      },

      {
        text: `Je soussigné(e) ${nomBailleur}, bailleur(euse) du bien désigné ci-dessus, déclare avoir reçu de ${locataire.nom_complet} un PAIEMENT PARTIEL du loyer et des charges pour la période de ${libellePeriode} :`
      },

      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              { text: 'Désignation', bold: true },
              { text: 'Montant', bold: true, alignment: 'right' }
            ],
            ['Loyer et charges attendus (CC)', { text: euro(attendu), alignment: 'right' }],
            [
              'Montant reçu' + (modePaiement ? ` (${modePaiement})` : ''),
              { text: euro(montantRecu), alignment: 'right' }
            ],
            [
              { text: 'RESTE DÛ', bold: true },
              { text: euro(reste), bold: true, alignment: 'right' }
            ]
          ]
        },
        margin: [0, 10, 0, 16]
      },

      {
        text: `Ce reçu ne vaut pas quittance : la quittance définitive sera délivrée dès le règlement du solde. Cette attestation est délivrée gratuitement.`,
        style: 'note'
      },

      {
        columns: [
          {
            width: '50%',
            stack: [{ text: lieuDate, margin: [0, 30, 0, 0] }]
          },
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
