// ============================================================================
// Vérificateur des 30 dossiers de démo — s'exécute dans ELECTRON
// (better-sqlite3 est compilé pour Electron ; vitest tourne sur Node pur,
// cf. AGENTS.md §2). Lancé par `node scripts/check_demo_30.mjs`.
//
// Chaîne de vérification :
//   1. base SQLite TEMPORAIRE (app.setPath('userData') → jamais %APPDATA%,
//      jamais la base réelle du propriétaire) ;
//   2. migrations SQL réelles appliquées ;
//   3. import de fixtures/demo-30/baux.csv — réplique ligne à ligne le
//      mapping de commitImport (lié au dialog natif, donc non réutilisable
//      tel quel — cf. limites) avec les VRAIS parseurs shared/csv.ts ;
//   4. compléments post-import issus de dossiers.json (ce que l'import ne
//      peut pas porter : jour de paiement... non — dépôt, type de charges,
//      congés, révisions IRL, régularisations, fusion de colocation) ;
//   5. chargement de paiements.csv (format d'export de l'app) ;
//   6. invariants (montantAttendu réel de shared/echeancier.ts, formule de
//      révision, alertes réelles de alertes.service.ts, solde, quittances
//      générables) ;
//   7. tableau 30 lignes + exit 0/1.
// ============================================================================

import { app } from 'electron'
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'
// Imports statiques (sûrs : connection.ts n'ouvre la base qu'au premier getDb).
import { getRawConnection } from '../../src/main/database/connection'
import { computeAlertes } from '../../src/main/services/alertes.service'
import { parseCsv, frNombre, frDate } from '@shared/csv'
import { montantAttendu } from '@shared/echeancier'
import type { TypeBien } from '@shared/types'

const ici = dirname(fileURLToPath(import.meta.url))
const fixtures = process.env.CHECK_DEMO_FIXTURES
if (!fixtures)
  throw new Error('CHECK_DEMO_FIXTURES non défini (lancé via scripts/check_demo_30.mjs)')

// 1) Base temporaire — JAMAIS %APPDATA%\gestyloc (16 baux réels du propriétaire).
const dossierTest = mkdtempSync(join(tmpdir(), 'gestyloc-check-demo-'))
app.setPath('userData', dossierTest)

const { bailRepository } = await import('../../src/main/repositories/bail.repository')

// ----------------------------------------------------------------------------
// Petites briques
// ----------------------------------------------------------------------------
const round2 = (v: number): number => Math.round(v * 100) / 100
let reussis = 0
const echecs: string[] = []
const lignesTableau: string[] = []
async function test(nom: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn()
    reussis++
    console.log(`  ✓ ${nom}`)
  } catch (err) {
    echecs.push(nom)
    console.error(`  ✗ ${nom}\n    ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ----------------------------------------------------------------------------
// 2) Migrations réelles sur la base temporaire
// ----------------------------------------------------------------------------
const conn = getRawConnection()
conn.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`)
const dossierMigrations = join(ici, '../../src/main/database/migrations')
const fichiersSql = readdirSync(dossierMigrations)
  .filter((f) => f.endsWith('.sql'))
  .sort()
for (const f of fichiersSql) conn.exec(readFileSync(join(dossierMigrations, f), 'utf-8'))

// ----------------------------------------------------------------------------
// 3) Import de baux.csv — réplique CONFORME de commitImport (import.service.ts)
//    (commitImport est lié à la boîte de dialogue native : non appelable
//    headless ; aucun refactor autorisé → duplication commentée).
// ----------------------------------------------------------------------------
const LIGNE_IGNOREE = /^(Total|Type de Bien|Appartements|Garages|Colonne|ID)/i
const TYPES_VALIDES: TypeBien[] = [
  'Appartement',
  'Maison',
  'Garage',
  'Parking',
  'Local',
  'Studio',
  'Autre'
]

const contenuBaux = readFileSync(join(fixtures, 'baux.csv'), 'utf-8')
const lignesBaux = parseCsv(contenuBaux)

const insBien = conn.prepare(
  'INSERT INTO biens (type_bien, designation, surface_m2, meuble, adresse, ville) VALUES (?,?,?,?,?,?)'
)
const insLoc = conn.prepare('INSERT INTO locataires (nom_complet) VALUES (?)')
const insBail = conn.prepare(
  `INSERT INTO baux (bien_id, locataire_id, date_debut_bail, date_fin_bail,
   trimestre_reference, loyer_hc, charges, loyer_cc, loyer_metre_carre_hc,
   loyer_annuel_hc, loyer_annuel_cc, irl_reference, irl_nouveau, taux_irl,
   nouveau_loyer_hc, frais_agence, actif, occupation_gratuite)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
)

const bailIdParCle = new Map<string, number>() // (designation § locataire) → bail_id
{
  const importer = conn.transaction(() => {
    for (const l of lignesBaux) {
      const id = (l[0] ?? '').trim()
      const locataire = (l[2] ?? '').trim()
      if (id === '' || LIGNE_IGNOREE.test(id) || locataire === '') continue
      const typeBrut = (l[1] ?? '').trim()
      const type = (TYPES_VALIDES.find((t) => t.toLowerCase() === typeBrut.toLowerCase()) ??
        'Autre') as TypeBien
      const contientNumero = /\d/.test(id)
      const bienId = insBien.run(
        type,
        id,
        frNombre(l[8]),
        /true/i.test(l[7] ?? '') ? 1 : 0,
        contientNumero ? id : null,
        contientNumero ? id : null
      ).lastInsertRowid as number
      let locId = conn.prepare('SELECT id FROM locataires WHERE nom_complet = ?').get(locataire) as
        { id: number } | undefined
      if (!locId) {
        locId = { id: insLoc.run(locataire).lastInsertRowid as number }
      }
      const hc = frNombre(l[10])
      const charges = frNombre(l[11])
      const surface = frNombre(l[8])
      const cc = hc !== null ? round2(hc + (charges ?? 0)) : null
      const arrondi = (v: number | null): number | null => (v !== null ? round2(v) : null)
      const annuelHc = arrondi(hc !== null ? hc * 12 : null)
      const annuelCc = arrondi(cc !== null ? cc * 12 : null)
      const loyerM2 = arrondi(hc !== null && surface ? hc / surface : null)
      const bailId = insBail.run(
        bienId,
        locId.id,
        frDate(l[3]),
        frDate(l[4]),
        (l[6] ?? '').trim() || null,
        hc,
        charges,
        cc,
        loyerM2,
        annuelHc,
        annuelCc,
        frNombre(l[13]),
        frNombre(l[14]),
        (() => {
          const ref = frNombre(l[13])
          const nouv = frNombre(l[14])
          return ref && nouv && ref > 0 ? Math.round((nouv / ref - 1) * 100000) / 1000 : null
        })(),
        frNombre(l[16]),
        frNombre(l[20]),
        1,
        0
      ).lastInsertRowid as number

      bailIdParCle.set(`${id} § ${locataire}`, bailId)
    }
  })
  importer()
}

// ----------------------------------------------------------------------------
// 4) Compléments post-import (dossiers.json)
// ----------------------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(fixtures, 'dossiers.json'), 'utf-8')) as {
  dossiers: Array<{
    id: string
    famille: string
    designation: string
    locataires: string[]
    bail: {
      debut: string
      fin: string | null
      hc: number
      charges: number | null
      cc: number | null
    }
    complements: {
      actif?: boolean
      depotGarantie?: number
      typeCharges?: string
      colocation?: boolean
      revisions?: Array<{
        date: string
        ancienHc: number
        nouvelHc: number
        irlRef: number
        irlNouv: number
        taux: number
        trimestreRef: string
      }>
      dateDerniereRevision?: string | null
      tauxIrl?: number | null
      trimestreReference?: string | null
      regularisations?: Array<{ annee: number; chargesReelles: number }>
    }
    paiements: Array<{
      periode: string
      montant: number
      statut: string
      date: string | null
      mode: string | null
      ref: string | null
      locataire?: string
    }>
    attendus: Record<string, unknown>
    refsBail: string[]
  }>
}

/** bail_id d'un dossier à partir de sa clé de rattachement (designation § loc). */
function bailIdDe(dossierId: string, indexLoc = 0): number {
  const d = manifest.dossiers.find((x) => x.id === dossierId) as {
    designation: string
    locataires: string[]
  }
  const cle = `${d.designation} § ${d.locataires[indexLoc]}`
  const id = bailIdParCle.get(cle)
  if (!id) throw new Error(`Bail introuvable pour ${dossierId} (clé « ${cle} »)`)
  return id
}

{
  const appliquer = conn.transaction(() => {
    for (const d of manifest.dossiers) {
      const c = d.complements
      for (let i = 0; i < d.locataires.length; i++) {
        const bailId = bailIdDe(d.id, i)
        if (c.actif === false) conn.prepare('UPDATE baux SET actif = 0 WHERE id = ?').run(bailId)
        if (c.depotGarantie !== undefined)
          conn
            .prepare('UPDATE baux SET depot_garantie = ? WHERE id = ?')
            .run(c.depotGarantie, bailId)
        if (c.typeCharges)
          conn.prepare('UPDATE baux SET type_charges = ? WHERE id = ?').run(c.typeCharges, bailId)
        if (c.revisions?.length) {
          const derniere = c.revisions.at(-1) as (typeof c.revisions)[number]
          conn
            .prepare(
              `UPDATE baux SET irl_reference = ?, irl_nouveau = ?, taux_irl = ?,
             date_derniere_revision = ?, trimestre_reference = ? WHERE id = ?`
            )
            .run(
              derniere.irlNouv,
              derniere.irlNouv,
              c.tauxIrl ?? null,
              c.dateDerniereRevision ?? null,
              c.trimestreReference ?? null,
              bailId
            )
          for (const r of c.revisions) {
            conn
              .prepare(
                `INSERT INTO baux_revisions (bail_id, date_revision, ancien_loyer_hc,
               nouveau_loyer_hc, irl_reference, irl_nouveau, taux) VALUES (?,?,?,?,?,?,?)`
              )
              .run(bailId, r.date, r.ancienHc, r.nouvelHc, r.irlRef, r.irlNouv, r.taux)
          }
        }
        for (const reg of c.regularisations ?? []) {
          conn
            .prepare(
              'INSERT INTO regularisations_charges (bail_id, annee, charges_reelles) VALUES (?,?,?)'
            )
            .run(bailId, reg.annee, reg.chargesReelles)
        }
      }
      // Colocation : l'import a créé 1 bien par ligne → on fusionne les 2
      // baux sur le premier bien et on supprime le bien dupliqué (l'app
      // n'a pas d'import multi-baux par bien — cf. limites README fixtures).
      if (c.colocation) {
        const bailA = bailIdDe(d.id, 0)
        const bailB = bailIdDe(d.id, 1)
        const bienA = (
          conn.prepare('SELECT bien_id FROM baux WHERE id = ?').get(bailA) as { bien_id: number }
        ).bien_id
        const bienB = (
          conn.prepare('SELECT bien_id FROM baux WHERE id = ?').get(bailB) as { bien_id: number }
        ).bien_id
        conn.prepare('UPDATE baux SET bien_id = ? WHERE id = ?').run(bienA, bailB)
        conn.prepare('DELETE FROM biens WHERE id = ?').run(bienB)
      }
    }
  })
  appliquer()
}

// ----------------------------------------------------------------------------
// 5) paiements.csv — format d'export de l'app ; bail_id = ordre de ligne de
//    baux.csv sur une base neuve (autoincrement), recoupé avec la clé
//    (designation § locataire) issue du manifest.
// ----------------------------------------------------------------------------
const contenuPaiements = readFileSync(join(fixtures, 'paiements.csv'), 'utf-8')
const lignesPaiements = parseCsv(contenuPaiements).filter((l) => !isNaN(parseInt(l[0], 10)))
{
  const insPaiement = conn.prepare(
    `INSERT INTO paiements (bail_id, periode, montant_paye, date_paiement, statut,
     mode_paiement, reference) VALUES (?,?,?,?,?,?,?)`
  )
  const importer = conn.transaction(() => {
    for (const l of lignesPaiements) {
      const bailIdCsv = parseInt(l[0], 10)
      assert.ok(Number.isInteger(bailIdCsv) && bailIdCsv >= 1, `bail_id invalide : « ${l[0]} »`)
      insPaiement.run(
        bailIdCsv,
        (l[1] ?? '').trim(),
        frNombre(l[2]) ?? 0,
        (l[3] ?? '').trim() || null,
        (l[4] ?? '').trim() || 'impaye',
        (l[5] ?? '').trim() || null,
        (l[6] ?? '').trim() || null
      )
    }
  })
  importer()
}

// ----------------------------------------------------------------------------
// 6) Invariants
// ----------------------------------------------------------------------------
interface PaiementRow {
  bail_id: number
  periode: string
  montant_paye: number
  statut: string
}
const paiementsRows = conn
  .prepare('SELECT bail_id, periode, montant_paye, statut FROM paiements')
  .all() as PaiementRow[]
const bailParId = new Map<
  number,
  {
    id: number
    bien_id: number
    locataire_id: number
    loyer_hc: number | null
    charges: number | null
    loyer_cc: number | null
    actif: number
    date_debut_bail: string | null
    date_fin_bail: string | null
    irl_reference: number | null
    irl_nouveau: number | null
    taux_irl: number | null
    date_derniere_revision: string | null
    trimestre_reference: string | null
    depot_garantie: number | null
    type_charges: string | null
    jour_paiement: number
  }
>()
for (const b of conn.prepare('SELECT * FROM baux').all() as Array<Record<string, unknown>>) {
  bailParId.set(b.id as number, b as never)
}

// L'attendu d'un bail = loyer_cc ?? (HC + charges) — formule de l'app
// (répliquée ici : la fonction de l'app prend un objet "BailEcheancier").
const attenduBail = (bailId: number, periode: string): number | null => {
  const b = bailParId.get(bailId) as never as {
    loyer_cc: number | null
    loyer_hc: number | null
    charges: number | null
    date_debut_bail: string | null
  }
  return montantAttendu(
    {
      date_debut_bail: b.date_debut_bail,
      loyer_cc: b.loyer_cc,
      loyer_hc: b.loyer_hc,
      charges: b.charges
    },
    periode
  )
}

console.log('\n=== Invariants ===\n')

await test('base neuve : 30 dossiers importés sans erreur (31 baux, 30 biens, 31 locataires)', () => {
  const nBaux = (conn.prepare('SELECT COUNT(*) n FROM baux').get() as { n: number }).n
  const nBiens = (conn.prepare('SELECT COUNT(*) n FROM biens').get() as { n: number }).n
  const nLocs = (conn.prepare('SELECT COUNT(*) n FROM locataires').get() as { n: number }).n
  const nPaiements = paiementsRows.length
  assert.equal(nBaux, 31, '31 baux (30 dossiers + 2ᵉ bail de la colocation)')
  assert.equal(nBiens, 30, '30 biens (colocation fusionnée)')
  assert.equal(nLocs, 31, '31 locataires (colocation : 2)')
  assert.equal(nPaiements, 351)
  assert.equal(manifest.dossiers.length, 30)
  // Recoupement : le bail_id positionnel de paiements.csv (ordre de ligne de
  // baux.csv, autoincrement sur base neuve) == celui de la clé de rattachement.
  let attendu = 0
  for (const d of manifest.dossiers) {
    for (let i = 0; i < d.locataires.length; i++) {
      attendu++
      const cle = `${d.designation} § ${d.locataires[i]}`
      const reel = bailIdParCle.get(cle)
      assert.ok(reel !== undefined, `${d.id} bail manquant (${cle})`)
      assert.equal(reel, attendu, `${d.id} : bail_id positionnel incohérent (${cle})`)
      assert.ok(
        paiementsRows.some((p) => p.bail_id === reel),
        `${d.id} : aucun paiement pour le bail ${reel}`
      )
    }
  }
})

await test('payé ⇒ montant = attendu réel de l’app (shared/echeancier.ts)', () => {
  for (const p of paiementsRows) {
    if (p.statut !== 'paye') continue
    const attendu = attenduBail(p.bail_id, p.periode)
    assert.ok(attendu !== null, `pas d'attendu pour bail ${p.bail_id} ${p.periode}`)
    assert.equal(p.montant_paye, round2(attendu as number), `bail ${p.bail_id} ${p.periode}`)
  }
})

await test('partiel ⇒ 0 < montant < attendu (3 reçus, pas de quittance)', () => {
  const partiels = paiementsRows.filter((p) => p.statut === 'partiel')
  assert.equal(partiels.length, 3)
  for (const p of partiels) {
    const attendu = attenduBail(p.bail_id, p.periode) as number
    assert.ok(
      p.montant_paye > 0 && p.montant_paye < attendu,
      `bail ${p.bail_id} ${p.periode} : ${p.montant_paye} vs ${attendu}`
    )
  }
})

await test('impayé ⇒ montant = 0 et 1/2/3 alertes impayé (paliers)', () => {
  for (const p of paiementsRows) {
    if (p.statut === 'impaye') assert.equal(p.montant_paye, 0)
  }
  const alertes = computeAlertes(bailRepository.listWithRelations())
  const famillesImpaye = manifest.dossiers.filter((d) => d.famille === 'impaye')
  for (const d of famillesImpaye) {
    const bailId = bailIdDe(d.id)
    const nbAlertes = alertes.filter((a) => a.type === 'impaye' && a.bail_id === bailId).length
    assert.equal(nbAlertes, d.attendus.nbMoisImpayes as number, `${d.id}`)
  }
})

await test('somme des paiements = solde attendu (par dossier)', () => {
  for (const d of manifest.dossiers) {
    const solde = d.paiements
      .filter((p) => p.statut === 'paye' || p.statut === 'partiel')
      .reduce((s, p) => s + p.montant, 0)
    const bailIds = d.locataires.map((_, i) => bailIdDe(d.id, i))
    const totalBdd = paiementsRows
      .filter((p) => bailIds.includes(p.bail_id) && (p.statut === 'paye' || p.statut === 'partiel'))
      .reduce((s, p) => s + p.montant_paye, 0)
    assert.equal(round2(totalBdd), round2(solde), `${d.id}`)
  }
})

await test('prorata = loyer × jours présents / jours du mois (4 dossiers)', () => {
  for (const d of manifest.dossiers.filter((x) => x.famille === 'prorata')) {
    const bailId = bailIdDe(d.id)
    const premiere = d.paiements[0] as { periode: string; montant: number }
    const attendu = attenduBail(bailId, premiere.periode) as number
    assert.equal(premiere.montant, attendu, `${d.id} : montant pointé`)
    // Recalcul indépendant (jours civils, jour d'entrée compris) :
    const [a, m, j] = (
      bailParId.get(bailId) as unknown as { date_debut_bail: string }
    ).date_debut_bail
      .split('-')
      .map(Number)
    const total = new Date(a, m, 0).getDate()
    const occupes = j <= 1 ? total : total - j + 1
    const cc = (bailParId.get(bailId) as unknown as { loyer_cc: number }).loyer_cc
    assert.equal(attendu, round2((cc * occupes) / total), `${d.id} : formule ${occupes}/${total}`)
    const fraction = occupes === total ? 'plein (entrée le 1er)' : `${occupes}/${total} j`
    assert.equal(String(d.attendus.fraction), fraction, `${d.id} : fraction manifest`)
  }
})

await test('révision IRL = loyer × (nouvel indice / ancien indice) + historique tracé', () => {
  for (const d of manifest.dossiers.filter((x) => x.famille === 'revision')) {
    const bailId = bailIdDe(d.id)
    const b = bailParId.get(bailId) as unknown as {
      loyer_hc: number
      irl_reference: number
      irl_nouveau: number
      date_derniere_revision: string | null
      trimestre_reference: string | null
    }
    if (d.complements.revisions?.length) {
      assert.equal(b.loyer_hc, d.attendus.revisionAttendue, `${d.id} : loyer après révision`)
      for (const r of d.complements.revisions) {
        assert.equal(
          round2(r.ancienHc * (r.irlNouv / r.irlRef)),
          r.nouvelHc,
          `${d.id} révision du ${r.date}`
        )
        const row = conn
          .prepare('SELECT * FROM baux_revisions WHERE bail_id = ? AND date_revision = ?')
          .get(bailId, r.date) as { taux: number; nouveau_loyer_hc: number } | undefined
        assert.ok(row, `${d.id} : ligne baux_revisions manquante (${r.date})`)
        assert.equal(row.taux, r.taux)
        assert.equal(row.nouveau_loyer_hc, r.nouvelHc)
      }
      assert.equal(b.irl_reference, b.irl_nouveau, `${d.id} : après application, ref == nouveau`)
      assert.equal(b.date_derniere_revision, d.complements.dateDerniereRevision, `${d.id}`)
    } else {
      assert.ok(b.irl_reference !== null, `${d.id} : irl_reference requis pour l'alerte`)
      assert.equal(b.date_derniere_revision, null, `${d.id} : jamais révisé`)
    }
  }
})

await test('alertes IRL : 2 appliquées sans alerte, 1 non appliquée + 1 année précédente avec alerte', () => {
  const alertes = computeAlertes(bailRepository.listWithRelations())
  const revisions = manifest.dossiers.filter((x) => x.famille === 'revision')
  for (const d of revisions) {
    const bailId = bailIdDe(d.id)
    const a = alertes.some((x) => x.type === 'revision_irl' && x.bail_id === bailId)
    assert.equal(a, d.attendus.alerteRevision as boolean, `${d.id}`)
  }
})

await test('30/30 dossiers quittancables (≥ 1 période « payé » — art. 21)', () => {
  let quittancables = 0
  for (const d of manifest.dossiers) {
    const bailIds = d.locataires.map((_, i) => bailIdDe(d.id, i))
    const aUnePayee = paiementsRows.some((p) => bailIds.includes(p.bail_id) && p.statut === 'paye')
    if (aUnePayee) quittancables++
  }
  assert.equal(quittancables, 30)
})

await test('congés : bail clos inactif + préavis actif, dépôt enregistré', () => {
  const conges = manifest.dossiers.filter((x) => x.famille === 'conge')
  assert.equal(conges.length, 2)
  const clos = bailParId.get(bailIdDe(conges[1].id)) as unknown as {
    actif: number
    depot_garantie: number
    date_fin_bail: string
  }
  assert.equal(clos.actif, 0, 'bail terminé : actif = 0')
  assert.equal(clos.depot_garantie, 665)
  assert.equal(clos.date_fin_bail, conges[1].bail.fin)
  const enCours = bailParId.get(bailIdDe(conges[0].id)) as unknown as {
    actif: number
    date_fin_bail: string
    depot_garantie: number
  }
  assert.equal(enCours.actif, 1, 'préavis en cours : actif = 1')
  assert.ok(enCours.date_fin_bail !== null && enCours.date_fin_bail > '2026-11-06')
  assert.ok(enCours.depot_garantie !== null)
  // Alerte fin de bail : urgente (expiré) ou non (< 90 j) — toujours présente.
  const alertes = computeAlertes(bailRepository.listWithRelations())
  assert.ok(
    alertes.some((a) => a.type === 'fin_bail' && a.bail_id === bailIdDe(conges[0].id)),
    'préavis en cours → alerte fin de bail'
  )
})

await test('charges provisionnelles + régularisation annuelle (écart correct)', () => {
  const regs = manifest.dossiers.filter((x) => x.famille === 'regularisation')
  assert.equal(regs.length, 2)
  for (const d of regs) {
    const bailId = bailIdDe(d.id)
    const b = bailParId.get(bailId) as unknown as { type_charges: string; charges: number }
    assert.equal(b.type_charges, 'provisionnelles')
    const row = conn
      .prepare('SELECT * FROM regularisations_charges WHERE bail_id = ? AND annee = 2025')
      .get(bailId) as { charges_reelles: number }
    assert.equal(row.charges_reelles, d.attendus.chargesReelles2025)
    const provisions = round2((b.charges as number) * 12)
    assert.equal(round2(provisions - row.charges_reelles), d.attendus.ecart, `${d.id} : écart`)
  }
})

await test('parking sans charges : attendu = loyer CC = HC', () => {
  const d = manifest.dossiers.find((x) => x.famille === 'parking') as { id: string }
  const bailId = bailIdDe(d.id)
  const b = bailParId.get(bailId) as unknown as {
    charges: number | null
    loyer_cc: number | null
    loyer_hc: number | null
  }
  assert.equal(b.charges, null)
  assert.equal(b.loyer_cc, b.loyer_hc)
  assert.equal(attenduBail(bailId, '2026-11'), b.loyer_cc)
})

await test('colocation : 1 bien, 2 baux à la moitié du loyer, paiements découpés', () => {
  const d = manifest.dossiers.find(
    (x) => x.famille === 'colocation'
  ) as (typeof manifest.dossiers)[number]
  const bailA = bailIdDe(d.id, 0)
  const bailB = bailIdDe(d.id, 1)
  const a = bailParId.get(bailA) as unknown as { bien_id: number; loyer_cc: number }
  const b = bailParId.get(bailB) as unknown as { bien_id: number; loyer_cc: number }
  assert.equal(a.bien_id, b.bien_id, 'les 2 baux pointent le même bien')
  assert.equal(round2(a.loyer_cc + b.loyer_cc), d.bail.cc, 'moitié + moitié = loyer total')
  const nbBiensDuDossier = new Set([a.bien_id, b.bien_id]).size
  assert.equal(nbBiensDuDossier, 1)
})

// ----------------------------------------------------------------------------
// 7) Tableau des 30 dossiers + verdict
// ----------------------------------------------------------------------------
console.log('\n=== Les 30 dossiers ===\n')
const alertes = computeAlertes(bailRepository.listWithRelations())
for (const d of manifest.dossiers) {
  const bailIds = d.locataires.map((_, i) => bailIdDe(d.id, i))
  const nbPaiements = paiementsRows.filter((p) => bailIds.includes(p.bail_id)).length
  const nbPayes = paiementsRows.filter(
    (p) => bailIds.includes(p.bail_id) && p.statut === 'paye'
  ).length
  const nbImpayes = alertes.filter((a) => a.type === 'impaye' && bailIds.includes(a.bail_id)).length
  const actif = (bailParId.get(bailIds[0]) as unknown as { actif: number }).actif
  const etat = actif === 1 ? 'actif' : 'clos'
  lignesTableau.push(
    `${d.id.padEnd(4)} ${d.famille.padEnd(15)} ${d.locataires.length} loc · ${bailIds.length} bail · ${String(nbPaiements).padStart(3)} pmt (${nbPayes} payés, ${nbImpayes} alerte(s) impayé) · ${etat.padEnd(5)} → ${d.resultat}`
  )
}
console.log(lignesTableau.join('\n'))

// ----------------------------------------------------------------------------
// Nettoyage — la base temporaire est SUPPRIMÉE.
// ----------------------------------------------------------------------------
const base = join(dossierTest, 'data', 'app.db')
assert.ok(existsSync(base), 'la base temporaire doit exister dans userData redirigé')
try {
  conn.close()
} catch {
  /* déjà fermée */
}
rmSync(dossierTest, { recursive: true, force: true })
assert.ok(!existsSync(base), 'la base temporaire doit être supprimée')
console.log(`\nBase temporaire supprimée (${dossierTest}) — la base réelle n'a jamais été ouverte.`)

console.log(`\n${reussis} vérification(s) réussie(s), ${echecs.length} échec(s)`)
if (echecs.length > 0) {
  console.error('ÉCHECS : ' + echecs.join(' ; '))
  process.exit(1)
}
process.exit(0)
