import { differenceInCalendarDays, parseISO, isValid } from 'date-fns'
import { paiementRepository } from '../repositories/paiement.repository'
import type { Alerte, BienLocationRow } from '@shared/types'

/**
 * Service de calcul des alertes du dashboard :
 *  - fins de bail approchantes (< 90 jours) ou dépassées
 *  - révisions de loyer IRL/ICC à faire (pas révisé depuis > 1 an)
 *  - loyers impayés sur les périodes récentes
 */
export function computeAlertes(rows: BienLocationRow[]): Alerte[] {
  const alertes: Alerte[] = []
  const aujourdhui = new Date()

  for (const row of rows) {
    if (!row.bail.actif) continue
    // Occupation gratuite (famille) : pas de loyer -> pas d'alerte IRL ni impayé.
    if (row.bail.occupation_gratuite) continue

    // --- Fin de bail < 90 jours ---
    if (row.bail.date_fin_bail) {
      const fin = parseISO(row.bail.date_fin_bail)
      if (isValid(fin)) {
        const jours = differenceInCalendarDays(fin, aujourdhui)
        if (jours < 0) {
          alertes.push({
            type: 'fin_bail',
            severite: 'urgent',
            message: `Bail EXPIRÉ depuis ${Math.abs(jours)} jours — ${row.bien.type_bien} « ${row.bien.designation} » (${row.locataire.nom_complet})`,
            bail_id: row.bail.id
          })
        } else if (jours < 90) {
          alertes.push({
            type: 'fin_bail',
            severite: jours < 30 ? 'urgent' : 'warning',
            message: `Fin de bail dans ${jours} jours — ${row.bien.type_bien} « ${row.bien.designation} » (${row.locataire.nom_complet})`,
            bail_id: row.bail.id
          })
        }
      }
    }

    // --- Révision IRL : uniquement à la DATE ANNIVERSAIRE du bail (art. 17-2) ---
    // On alerte seulement si l'anniversaire de l'année en cours est déjà passé
    // et que la dernière révision enregistrée est antérieure à cet anniversaire.
    if (row.bail.irl_reference !== null && row.bail.date_debut_bail) {
      const debut = parseISO(row.bail.date_debut_bail)
      const derniereRevision = row.bail.date_derniere_revision
        ? parseISO(row.bail.date_derniere_revision)
        : null
      if (isValid(debut)) {
        // Anniversaire de cette année (même jour/mois que le début du bail).
        const anniversaire = new Date(
          aujourdhui.getFullYear(),
          debut.getMonth(),
          debut.getDate()
        )
        const dejaPasse = anniversaire <= aujourdhui
        const reviseDepuisAnniversaire =
          derniereRevision !== null && isValid(derniereRevision) && derniereRevision >= anniversaire
        if (dejaPasse && !reviseDepuisAnniversaire) {
          alertes.push({
            type: 'revision_irl',
            severite: 'info',
            message: `Révision IRL à effectuer pour ${row.locataire.nom_complet} (${row.bien.designation}) — anniversaire du ${anniversaire.toLocaleDateString('fr-FR')}`,
            bail_id: row.bail.id
          })
        }
      }
    }

    // --- Assurance : demander l'attestation ~30 jours avant l'anniversaire ---
    if (row.bail.date_debut_bail) {
      const debut = parseISO(row.bail.date_debut_bail)
      if (isValid(debut)) {
        const anniversaire = new Date(
          aujourdhui.getFullYear(),
          debut.getMonth(),
          debut.getDate()
        )
        const joursAvant = differenceInCalendarDays(anniversaire, aujourdhui)
        if (joursAvant >= 0 && joursAvant <= 30) {
          alertes.push({
            type: 'assurance',
            severite: 'info',
            message: `Demander l'attestation d'assurance à ${row.locataire.nom_complet} (${row.bien.designation}) — anniversaire du bail dans ${joursAvant} jour(s)`,
            bail_id: row.bail.id
          })
        }
      }
    }
  }

  // --- Loyers impayés (statut 'impaye' ou 'retard' pointé) ---
  const paiements = paiementRepository.listAll()
  for (const p of paiements) {
    if (p.statut === 'impaye' || p.statut === 'retard') {
      const row = rows.find((r) => r.bail.id === p.bail_id)
      if (row) {
        alertes.push({
          type: 'impaye',
          severite: p.statut === 'retard' ? 'urgent' : 'warning',
          message: `Loyer ${p.statut} — ${row.locataire.nom_complet} (${row.bien.designation}) — période ${p.periode}`,
          bail_id: row.bail.id
        })
      }
    }
  }

  // Tri : urgents d'abord.
  const poids = { urgent: 0, warning: 1, info: 2 } as const
  return alertes.sort((a, b) => poids[a.severite] - poids[b.severite])
}
