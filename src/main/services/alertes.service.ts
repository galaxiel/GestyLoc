import { differenceInCalendarDays, parseISO, isValid } from 'date-fns'
import { paiementRepository } from '../repositories/paiement.repository'
import { parametresRepository } from '../repositories/parametres.repository'
import { joursDeRetard, echeanceIso } from '@shared/echeancier'
import type { Alerte, BienLocationRow } from '@shared/types'

/** Période 'yyyy-mm' du mois courant (même format que les paiements). */
function periodeDuJour(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Marge (en jours) tolérée après le jour de paiement avant alerte de retard. */
export function margeRetardJours(): number {
  const cfg = parametresRepository.get<{ marge_retard_jours?: number }>('echeancier')
  const m = cfg?.marge_retard_jours
  return typeof m === 'number' && m >= 0 ? Math.trunc(m) : 0
}

/**
 * Service de calcul des alertes du dashboard :
 *  - fins de bail approchantes (< 90 jours) ou dépassées
 *  - révisions de loyer IRL/ICC à faire (pas révisé depuis > 1 an)
 *  - loyers impayés sur les périodes récentes
 *  - loyer du mois courant non pointé après le jour de paiement (+ marge)
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
        const anniversaire = new Date(aujourdhui.getFullYear(), debut.getMonth(), debut.getDate())
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
    // Sauf si une demande a déjà été envoyée il y a moins de 11 mois
    // (traçage migration 0013 : ne pas relancer pour rien).
    if (row.bail.date_debut_bail) {
      const debut = parseISO(row.bail.date_debut_bail)
      if (isValid(debut)) {
        const anniversaire = new Date(aujourdhui.getFullYear(), debut.getMonth(), debut.getDate())
        const joursAvant = differenceInCalendarDays(anniversaire, aujourdhui)
        const derniereDemande = row.bail.assurance_demandee_le
          ? parseISO(row.bail.assurance_demandee_le)
          : null
        const demandeRecente =
          derniereDemande !== null &&
          isValid(derniereDemande) &&
          differenceInCalendarDays(aujourdhui, derniereDemande) < 330
        if (joursAvant >= 0 && joursAvant <= 30 && !demandeRecente) {
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

  // --- Échéancier réel : loyer du mois courant non encaissé après l'échéance ---
  // Alerte seulement si AUCUN pointage payé/partiel pour la période courante
  // et si on a dépassé le jour de paiement (+ marge configurable, paramètres
  // clé 'echeancier' → { marge_retard_jours }). Les pointages retard/impayé
  // explicites sont déjà couverts par la boucle ci-dessus.
  const marge = margeRetardJours()
  const periode = periodeDuJour(aujourdhui)
  for (const row of rows) {
    if (!row.bail.actif || row.bail.occupation_gratuite) continue
    const pointe = paiements.find((p) => p.bail_id === row.bail.id && p.periode === periode)
    if (pointe && (pointe.statut === 'paye' || pointe.statut === 'partiel')) continue
    if (pointe && (pointe.statut === 'retard' || pointe.statut === 'impaye')) continue
    const retard = joursDeRetard(periode, row.bail.jour_paiement, marge, aujourdhui)
    if (retard > 0) {
      const echeance = echeanceIso(periode, row.bail.jour_paiement)
      alertes.push({
        type: 'impaye',
        severite: retard > 15 ? 'urgent' : 'warning',
        message: `Loyer non encaissé depuis le ${echeance.split('-')[2]}/${echeance.split('-')[1]} (retard de ${retard} j) — ${row.locataire.nom_complet} (${row.bien.designation})`,
        bail_id: row.bail.id
      })
    }
  }

  // Tri : urgents d'abord.
  const poids = { urgent: 0, warning: 1, info: 2 } as const
  return alertes.sort((a, b) => poids[a.severite] - poids[b.severite])
}
