// essais/best-of-n/attempt-3/impl-revision.ts
var AUJOURDHUI = new Date(2026, 10, 6);
var ANNEE_REFERENCE = AUJOURDHUI.getFullYear();
function centimes(x) {
  return Math.round(x * 100) / 100;
}
function dateIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  if (!m)
    return null;
  const annee = parseInt(m[1], 10);
  const mois = parseInt(m[2], 10) - 1;
  const jour = parseInt(m[3], 10);
  const d = new Date(annee, mois, jour);
  if (isNaN(d.getTime()) || d.getFullYear() !== annee || d.getMonth() !== mois || d.getDate() !== jour) {
    return null;
  }
  return d;
}
function dernierJourDuMois(y, mois0) {
  return new Date(y, mois0 + 1, 0).getDate();
}
function simulerRattrapageIrl(baux, anneeDepart, irlParTrimestre, tauxFixeAnnuel) {
  return baux.map((bail) => {
    const debut = dateIso(bail.dateDebutBail);
    if (debut === null || !(bail.loyerHcActuel > 0)) {
      return {
        bailId: bail.bailId,
        designation: bail.designation,
        locataire: bail.locataire,
        loyerActuel: bail.loyerHcActuel,
        loyerSimule: bail.loyerHcActuel,
        deltaMois: 0,
        deltaAn: 0,
        revisionsJouees: 0
      };
    }
    let trimestre = 1 + Math.floor(debut.getMonth() / 3);
    const ref = /\bT([1-4])\b/.exec(bail.trimestreRef ?? "");
    if (ref)
      trimestre = parseInt(ref[1], 10);
    let loyer = bail.loyerHcActuel;
    let revisionsJouees = 0;
    for (let y = anneeDepart; y <= ANNEE_REFERENCE; y++) {
      const jour = Math.min(debut.getDate(), dernierJourDuMois(y, debut.getMonth()));
      const anniversaire = new Date(y, debut.getMonth(), jour);
      if (anniversaire <= debut)
        continue;
      if (anniversaire > AUJOURDHUI)
        continue;
      let ratio = null;
      if (irlParTrimestre) {
        const prec = irlParTrimestre.get(`${y - 1}-Q${trimestre}`);
        const cour = irlParTrimestre.get(`${y}-Q${trimestre}`);
        if (prec !== void 0 && cour !== void 0 && prec > 0 && cour > 0) {
          ratio = cour / prec;
        }
      } else if (tauxFixeAnnuel !== null) {
        ratio = 1 + tauxFixeAnnuel / 100;
      }
      if (ratio === null)
        continue;
      loyer = centimes(loyer * ratio);
      revisionsJouees++;
    }
    const deltaMois = centimes(loyer - bail.loyerHcActuel);
    return {
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: centimes(deltaMois * 12),
      revisionsJouees
    };
  });
}

// essais/best-of-n/attempt-3/impl-prorata.ts
function centimes2(x) {
  return Math.round(x * 100) / 100;
}
function loyerCcPlein(bail) {
  const cc = bail.loyer_cc;
  if (cc !== null && cc !== void 0)
    return centimes2(cc);
  const hc = bail.loyer_hc;
  const charges = bail.charges;
  const hcRenseigne = hc !== null && hc !== void 0;
  const chargesRenseignees = charges !== null && charges !== void 0;
  if (hcRenseigne || chargesRenseignees)
    return centimes2((hc ?? 0) + (charges ?? 0));
  return null;
}
function periodeDebut(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[1]}-${m[2]}` : null;
}
function jourEntree(iso) {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso ?? "");
  const j = m ? parseInt(m[1], 10) : NaN;
  return j >= 1 && j <= 31 ? j : null;
}
function estBissextile(annee) {
  return annee % 4 === 0 && annee % 100 !== 0 || annee % 400 === 0;
}
var JOURS_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function joursDansMois(annee, mois) {
  if (mois === 2 && estBissextile(annee))
    return 29;
  return JOURS_MOIS[mois - 1] ?? 31;
}
function joursOccupes(jour, total) {
  const j = Math.min(Math.max(Math.trunc(jour), 1), total);
  return total - j + 1;
}
function montantAttendu(bail, periode) {
  const plein = loyerCcPlein(bail);
  if (plein === null)
    return null;
  const moisDebut = periodeDebut(bail.date_debut_bail);
  if (moisDebut === null || moisDebut !== periode)
    return plein;
  const jour = jourEntree(bail.date_debut_bail);
  if (jour === null || jour <= 1)
    return plein;
  const [a, m] = periode.split("-").map((x) => parseInt(x, 10));
  const total = joursDansMois(a, m);
  const occupe = joursOccupes(jour, total);
  return centimes2(plein * occupe / total);
}
export {
  montantAttendu,
  simulerRattrapageIrl
};
