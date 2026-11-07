// shared/stats.ts
function parseIsoLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m)
    return null;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return isNaN(d.getTime()) ? null : d;
}
function simulerRattrapageIrl(baux, anneeDepart, irlParTrimestre, tauxFixeAnnuel) {
  const anneeCourante = (/* @__PURE__ */ new Date()).getFullYear();
  return baux.map((b) => {
    const debut = parseIsoLocal(b.dateDebutBail);
    if (debut === null || b.loyerHcActuel <= 0) {
      return {
        bailId: b.bailId,
        designation: b.designation,
        locataire: b.locataire,
        loyerActuel: b.loyerHcActuel,
        loyerSimule: b.loyerHcActuel,
        deltaMois: 0,
        deltaAn: 0,
        revisionsJouees: 0
      };
    }
    let trimestre = 1 + Math.floor(debut.getMonth() / 3);
    const matchRef = (b.trimestreRef ?? "").match(/\bT([1-4])\b/);
    if (matchRef)
      trimestre = parseInt(matchRef[1], 10);
    let loyer = b.loyerHcActuel;
    let revisions = 0;
    for (let y = anneeDepart; y <= anneeCourante; y++) {
      const dernierJour = new Date(y, debut.getMonth() + 1, 0).getDate();
      const anniversaire = new Date(y, debut.getMonth(), Math.min(debut.getDate(), dernierJour));
      if (anniversaire <= debut)
        continue;
      if (anniversaire > /* @__PURE__ */ new Date())
        continue;
      let ratio = null;
      if (irlParTrimestre) {
        const prec = irlParTrimestre.get(`${y - 1}-Q${trimestre}`);
        const cour = irlParTrimestre.get(`${y}-Q${trimestre}`);
        if (prec && cour && prec > 0)
          ratio = cour / prec;
      } else if (tauxFixeAnnuel !== null) {
        ratio = 1 + tauxFixeAnnuel / 100;
      }
      if (ratio === null)
        continue;
      loyer = Math.round(loyer * ratio * 100) / 100;
      revisions++;
    }
    const deltaMois = Math.round((loyer - b.loyerHcActuel) * 100) / 100;
    return {
      bailId: b.bailId,
      designation: b.designation,
      locataire: b.locataire,
      loyerActuel: b.loyerHcActuel,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: Math.round(deltaMois * 12 * 100) / 100,
      revisionsJouees: revisions
    };
  });
}

// shared/echeancier.ts
function joursDansMois(annee, mois1_12) {
  return new Date(annee, mois1_12, 0).getDate();
}
function parsePeriode(periode) {
  const [a, m] = periode.split("-").map((x) => parseInt(x, 10));
  return [a, m];
}
function periodeDeDateIso(iso) {
  if (!iso)
    return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}` : null;
}
function jourDeDateIso(iso) {
  if (!iso)
    return null;
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso);
  const j = m ? parseInt(m[1], 10) : NaN;
  return j >= 1 && j <= 31 ? j : null;
}
function joursOccupes(jourEntree, annee, mois1_12) {
  const total = joursDansMois(annee, mois1_12);
  const j = Math.min(Math.max(Math.trunc(jourEntree), 1), total);
  return total - j + 1;
}
function loyerCcPlein(bail) {
  const cc = bail.loyer_cc ?? (bail.loyer_hc !== null || bail.charges !== null ? (bail.loyer_hc ?? 0) + (bail.charges ?? 0) : null);
  if (cc === null)
    return null;
  return Math.round(cc * 100) / 100;
}
function montantAttendu(bail, periode) {
  const plein = loyerCcPlein(bail);
  if (plein === null)
    return null;
  const [annee, mois] = parsePeriode(periode);
  if (isNaN(annee) || isNaN(mois))
    return plein;
  const periodeDebut = periodeDeDateIso(bail.date_debut_bail);
  if (!periodeDebut || periodeDebut !== periode)
    return plein;
  const jourEntree = jourDeDateIso(bail.date_debut_bail);
  if (jourEntree === null || jourEntree <= 1)
    return plein;
  const total = joursDansMois(annee, mois);
  const occupe = joursOccupes(jourEntree, annee, mois);
  return Math.round(plein * occupe / total * 100) / 100;
}
export {
  montantAttendu,
  simulerRattrapageIrl
};
