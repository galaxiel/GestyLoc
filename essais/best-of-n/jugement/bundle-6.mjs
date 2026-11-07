// essais/best-of-n/attempt-6/impl-revision.ts
var REFERENCE_TEMPORELLE = new Date(2026, 10, 6);
var centimes = (x) => Math.round(x * 100) / 100;
function parseDebutIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m)
    return null;
  const annee = parseInt(m[1], 10);
  const mois0 = parseInt(m[2], 10) - 1;
  if (mois0 < 0 || mois0 > 11)
    return null;
  const dernierJour = new Date(annee, mois0 + 1, 0).getDate();
  return { annee, mois0, jour: Math.min(Math.max(parseInt(m[3], 10), 1), dernierJour) };
}
function resultatIdentique(b) {
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
function simulerRattrapageIrl(baux, anneeDepart, irlParTrimestre, tauxFixeAnnuel) {
  const anneeCourante = REFERENCE_TEMPORELLE.getFullYear();
  return baux.map((b) => {
    if (!(b.loyerHcActuel > 0))
      return resultatIdentique(b);
    const debut = parseDebutIso(b.dateDebutBail);
    if (debut === null)
      return resultatIdentique(b);
    let trimestre = 1 + Math.floor(debut.mois0 / 3);
    const matchRef = (b.trimestreRef ?? "").match(/\bT([1-4])\b/);
    if (matchRef)
      trimestre = parseInt(matchRef[1], 10);
    const debutDate = new Date(debut.annee, debut.mois0, debut.jour);
    let loyer = b.loyerHcActuel;
    let revisions = 0;
    for (let y = anneeDepart; y <= anneeCourante; y++) {
      const anniversaire = new Date(y, debut.mois0, debut.jour);
      if (anniversaire <= debutDate)
        continue;
      if (anniversaire > REFERENCE_TEMPORELLE)
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
      revisions++;
    }
    const deltaMois = centimes(loyer - b.loyerHcActuel);
    return {
      bailId: b.bailId,
      designation: b.designation,
      locataire: b.locataire,
      loyerActuel: b.loyerHcActuel,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: centimes(deltaMois * 12),
      revisionsJouees: revisions
    };
  });
}

// essais/best-of-n/attempt-6/impl-prorata.ts
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
