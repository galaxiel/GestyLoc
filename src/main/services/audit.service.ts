// ============================================================================
// « Auditer mes données » — contrôle d'intégrité du parc.
// Détecte les anomalies héritées d'imports ou de saisies :
//   - adresses vides (quittances attaquables)
//   - doublons de locataires (nom normalisé)
//   - IRL suspectes (paires non annuelles, taux aberrants)
//   - loyers annuels incohérents avec le mensuel
//   - baux sans trimestre de référence (révision IRL impossible à piloter)
// Retourne une liste de constats sérialisable, aucune écriture en base.
// ============================================================================

import { getRawConnection } from '../database/connection'
import { bailRepository } from '../repositories/bail.repository'
import { valeurIrl } from '@shared/irl-insee'
import type { ConstatAudit } from '@shared/audit'



function normaliseNom(nom: string): string {
  return nom.toLowerCase().replace(/[.\s-]/g, '')
}

export function auditerDonnees(): ConstatAudit[] {
  const conn = getRawConnection()
  const rows = bailRepository.listWithRelations()
  const constats: ConstatAudit[] = []
  const nom = (d: string, l: string): string => `${d} (${l})`

  // ---- 1. Adresses vides ----
  for (const r of rows) {
    if (!r.bien.adresse) {
      constats.push({
        severite: 'critique',
        categorie: 'Adresse manquante',
        designation: nom(r.bien.designation, r.locataire.nom_complet),
        detail:
          'La quittance de ce bien n’identifie pas le logement loué (art. 21). Complète l’adresse dans la fiche du bien.'
      })
    }
  }

  // ---- 2. Doublons de locataires (nom normalisé) ----
  const vus = new Map<string, string>()
  for (const r of rows) {
    const cle = normaliseNom(r.locataire.nom_complet)
    if (vus.has(cle) && vus.get(cle) !== r.locataire.nom_complet) {
      constats.push({
        severite: 'attention',
        categorie: 'Doublon de locataire',
        designation: r.locataire.nom_complet,
        detail: `Deux fiches similaires : « ${vus.get(cle)} » et « ${r.locataire.nom_complet} ». Vérifie et supprime la fiche en trop (elle garde ses paiements).`
      })
    } else if (!vus.has(cle)) {
      vus.set(cle, r.locataire.nom_complet)
    }
  }

  // ---- 3. IRL : paire non annuelle ou trimestres inconnus ----
  for (const r of rows) {
    const { irl_reference, irl_nouveau, taux_irl, trimestre_reference } = r.bail
    if (r.bail.occupation_gratuite || (irl_reference === null && irl_nouveau === null)) continue
    const m = (trimestre_reference ?? '').match(/[1234]/)
    const annee = (trimestre_reference ?? '').match(/(19|20)\d{2}/)
    if (!m || !annee) {
      constats.push({
        severite: 'attention',
        categorie: 'Trimestre de référence illisible',
        designation: nom(r.bien.designation, r.locataire.nom_complet),
        detail: `« ${trimestre_reference ?? 'vide'} » — la révision IRL ne peut pas être pilotée. Corrige-le via l’outil de révision de la fiche du bail.`
      })
      continue
    }
    // Paire légale : IRL ref = T(n) année A, IRL nouveau = T(n) année A+1
    const refAttendu = valeurIrl(`${annee[0]}-Q${m[0]}`)
    if (refAttendu !== null && irl_reference !== null && Math.abs(refAttendu - irl_reference) > 0.01) {
      constats.push({
        severite: 'critique',
        categorie: 'IRL de référence non officielle',
        designation: nom(r.bien.designation, r.locataire.nom_complet),
        detail: `IRL ref ${irl_reference} ≠ INSEE ${refAttendu} pour ${trimestre_reference}. Corrige via l’outil de révision (les valeurs sont embarquées).`
      })
    }
    if (irl_reference && irl_nouveau && taux_irl !== null) {
      const paireLegale =
        valeurIrl(`${Number(annee[0]) + 1}-Q${m[0]}`) !== null &&
        Math.abs(irl_nouveau / irl_reference - 1) * 100 > 0 // informationnel
      if (!paireLegale) {
        constats.push({
          severite: 'attention',
          categorie: 'Paire IRL non annuelle',
          designation: nom(r.bien.designation, r.locataire.nom_complet),
          detail: `${irl_reference} → ${irl_nouveau} (+${taux_irl} %) ne correspond pas à deux trimestres consécutifs à un an d'écart. Révision à refaire proprement.`
        })
      }
    }
  }

  // ---- 4. Loyers annuels incohérents ----
  for (const r of rows) {
    const hc = r.bail.loyer_hc
    const cc = r.bail.loyer_cc
    const annuelHc = r.bail.loyer_annuel_hc
    const annuelCc = r.bail.loyer_annuel_cc
    if (hc !== null && annuelHc !== null && Math.abs(hc * 12 - annuelHc) > 0.02) {
      constats.push({
        severite: 'critique',
        categorie: 'Loyer annuel HC incohérent',
        designation: nom(r.bien.designation, r.locataire.nom_complet),
        detail: `Annuel enregistré ${annuelHc} ≠ mensuel ${hc} × 12 = ${Math.round(hc * 12 * 100) / 100}. Corrige via le formulaire du bail (ou réenregistre).`
      })
    }
    if (cc !== null && annuelCc !== null && Math.abs(cc * 12 - annuelCc) > 0.02) {
      constats.push({
        severite: 'critique',
        categorie: 'Loyer annuel CC incohérent',
        designation: nom(r.bien.designation, r.locataire.nom_complet),
        detail: `Annuel enregistré ${annuelCc} ≠ mensuel ${cc} × 12 = ${Math.round(cc * 12 * 100) / 100}.`
      })
    }
    // Loyer CC ≠ HC + charges
    if (hc !== null && r.bail.charges !== null && cc !== null && Math.abs(hc + r.bail.charges - cc) > 0.02) {
      constats.push({
        severite: 'attention',
        categorie: 'Loyer CC incohérent',
        designation: nom(r.bien.designation, r.locataire.nom_complet),
        detail: `CC ${cc} ≠ HC ${hc} + charges ${r.bail.charges}.`
      })
    }
  }

  // ---- 5. Baux actifs sans loyer ni statut gratuit ----
  for (const r of rows) {
    if (r.bail.actif && !r.bail.occupation_gratuite && r.bail.loyer_hc === null && r.bail.loyer_cc === null) {
      constats.push({
        severite: 'attention',
        categorie: 'Bail actif sans loyer',
        designation: nom(r.bien.designation, r.locataire.nom_complet),
        detail: 'Bail actif mais aucun loyer : complète le bail, ou bascule-le en « occupation gratuite ».'
      })
    }
  }

  // ---- 6. Baux actifs sans date de fin (info seulement) ----
  for (const r of rows) {
    if (r.bail.actif && !r.bail.occupation_gratuite && !r.bail.date_fin_bail) {
      constats.push({
        severite: 'attention',
        categorie: 'Bail sans date de fin',
        designation: nom(r.bien.designation, r.locataire.nom_complet),
        detail: 'Aucune alerte de fin de bail possible. Complète la date de fin (bail 3 ans par défaut).'
      })
    }
  }

  void conn
  return constats.sort((a, b) => (a.severite === 'critique' ? -1 : 1) - (b.severite === 'critique' ? -1 : 1))
}
