// essais/best-of-n/attempt-8/impl-revision.ts
var AUJOURDHUI_GELE = new Date(2026, 10, 6);
function centimes(x) {
  return Math.round(x * 100) / 100;
}
function parseDateIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m)
    return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function dernierJourDuMois(annee, mois1_12) {
  return new Date(annee, mois1_12, 0).getDate();
}
function trimestreIndexation(trimestreRef, moisDebut0) {
  const match = (trimestreRef ?? "").match(/\bT([1-4])\b/);
  if (match)
    return Number(match[1]);
  return 1 + Math.floor(moisDebut0 / 3);
}
function ratioPourAnnee(y, trimestre, irlParTrimestre, tauxFixeAnnuel) {
  if (irlParTrimestre !== null) {
    const prec = irlParTrimestre.get(`${y - 1}-Q${trimestre}`);
    const cour = irlParTrimestre.get(`${y}-Q${trimestre}`);
    if (prec === void 0 || cour === void 0 || prec <= 0 || cour <= 0)
      return null;
    return cour / prec;
  }
  if (tauxFixeAnnuel !== null)
    return 1 + tauxFixeAnnuel / 100;
  return null;
}
function simulerRattrapageIrl(baux, anneeDepart, irlParTrimestre, tauxFixeAnnuel) {
  const anneeCourante = AUJOURDHUI_GELE.getFullYear();
  return baux.map((bail) => {
    const base = {
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: bail.loyerHcActuel,
      deltaMois: 0,
      deltaAn: 0,
      revisionsJouees: 0
    };
    const debut = parseDateIso(bail.dateDebutBail);
    if (debut === null || !(bail.loyerHcActuel > 0))
      return base;
    const trimestre = trimestreIndexation(bail.trimestreRef, debut.getMonth());
    const jourAnniv = debut.getDate();
    const moisAnniv = debut.getMonth();
    let loyer = bail.loyerHcActuel;
    let revisionsJouees = 0;
    for (let y = anneeDepart; y <= anneeCourante; y++) {
      const anniversaire = new Date(
        y,
        moisAnniv,
        Math.min(jourAnniv, dernierJourDuMois(y, moisAnniv + 1))
      );
      if (anniversaire <= debut)
        continue;
      if (anniversaire > AUJOURDHUI_GELE)
        continue;
      const ratio = ratioPourAnnee(y, trimestre, irlParTrimestre, tauxFixeAnnuel);
      if (ratio === null)
        continue;
      loyer = centimes(loyer * ratio);
      revisionsJouees++;
    }
    const deltaMois = centimes(loyer - bail.loyerHcActuel);
    return {
      ...base,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: centimes(deltaMois * 12),
      revisionsJouees
    };
  });
}

// essais/best-of-n/attempt-8/impl-prorata.ts
function centimes2(x) {
  return Math.round(x * 100) / 100;
}
function loyerCcPlein(bail) {
  if (bail.loyer_cc !== null && bail.loyer_cc !== void 0)
    return centimes2(bail.loyer_cc);
  if (bail.loyer_hc !== null || bail.charges !== null) {
    return centimes2((bail.loyer_hc ?? 0) + (bail.charges ?? 0));
  }
  return null;
}
function periodeDeDebut(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[1]}-${m[2]}` : null;
}
function jourDeDebut(iso) {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso ?? "");
  const j = m ? Number(m[1]) : NaN;
  return j >= 1 && j <= 31 ? j : null;
}
function parsePeriode(periode) {
  const m = /^(\d{4})-(\d{2})/.exec(periode);
  return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
}
function estBissextile(annee) {
  return annee % 4 === 0 && annee % 100 !== 0 || annee % 400 === 0;
}
function joursDansMois(annee, mois1_12) {
  const longueurs = [31, estBissextile(annee) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return longueurs[mois1_12 - 1] ?? 31;
}
function montantAttendu(bail, periode) {
  const plein = loyerCcPlein(bail);
  if (plein === null)
    return null;
  if (periodeDeDebut(bail.date_debut_bail) !== periode)
    return plein;
  const jourEntree = jourDeDebut(bail.date_debut_bail);
  if (jourEntree === null || jourEntree <= 1)
    return plein;
  const [annee, mois] = parsePeriode(periode);
  if (Number.isNaN(annee) || Number.isNaN(mois) || mois < 1 || mois > 12)
    return plein;
  const total = joursDansMois(annee, mois);
  const jour = Math.min(Math.max(Math.trunc(jourEntree), 1), total);
  const joursOccupes = total - jour + 1;
  return centimes2(plein * joursOccupes / total);
}
export {
  montantAttendu,
  simulerRattrapageIrl
};
