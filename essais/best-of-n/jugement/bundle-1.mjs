// essais/best-of-n/attempt-1/impl-revision.ts
function arrondi2(x) {
  return Math.round(x * 100) / 100;
}
function parseDateIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m)
    return null;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return isNaN(d.getTime()) ? null : d;
}
function trimestreIndexation(trimestreRef, debut) {
  const match = (trimestreRef ?? "").match(/\bT([1-4])\b/);
  if (match)
    return parseInt(match[1], 10);
  return 1 + Math.floor(debut.getMonth() / 3);
}
function anniversaire(annee, mois0, jour) {
  const dernierJour = new Date(annee, mois0 + 1, 0).getDate();
  return new Date(annee, mois0, Math.min(jour, dernierJour));
}
function lireIndice(source, cle) {
  const v = typeof source.get === "function" ? source.get(cle) : source[cle];
  return typeof v === "number" ? v : void 0;
}
function ratioIrl(irl, trimestre, y) {
  const prec = lireIndice(irl, `${y - 1}-Q${trimestre}`);
  const cour = lireIndice(irl, `${y}-Q${trimestre}`);
  if (prec === void 0 || cour === void 0 || prec <= 0)
    return null;
  return cour / prec;
}
function simulerRattrapageIrl(baux, anneeDepart, irlParTrimestre, tauxFixeAnnuel) {
  const maintenant = /* @__PURE__ */ new Date();
  const anneeCourante = maintenant.getFullYear();
  return baux.map((bail) => {
    const identite = {
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
      return identite;
    const trimestre = trimestreIndexation(bail.trimestreRef, debut);
    const mois0 = debut.getMonth();
    const jour = debut.getDate();
    let loyer = bail.loyerHcActuel;
    let revisionsJouees = 0;
    for (let y = anneeDepart; y <= anneeCourante; y++) {
      const echeance = anniversaire(y, mois0, jour);
      if (echeance <= debut)
        continue;
      if (echeance > maintenant)
        continue;
      let ratio = null;
      if (irlParTrimestre != null) {
        ratio = ratioIrl(irlParTrimestre, trimestre, y);
      } else if (tauxFixeAnnuel != null) {
        ratio = 1 + tauxFixeAnnuel / 100;
      }
      if (ratio === null)
        continue;
      loyer = arrondi2(loyer * ratio);
      revisionsJouees++;
    }
    const deltaMois = arrondi2(loyer - bail.loyerHcActuel);
    return {
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: arrondi2(deltaMois * 12),
      revisionsJouees
    };
  });
}

// essais/best-of-n/attempt-1/impl-prorata.ts
var JOURS_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function estBissextile(annee) {
  return annee % 4 === 0 && annee % 100 !== 0 || annee % 400 === 0;
}
function joursDansMois(annee, mois1_12) {
  if (mois1_12 < 1 || mois1_12 > 12)
    return 0;
  const base = JOURS_MOIS[mois1_12 - 1];
  return mois1_12 === 2 && estBissextile(annee) ? 29 : base;
}
function parsePeriode(periode) {
  const m = /^(\d{4})-(\d{2})$/.exec(periode);
  if (!m)
    return null;
  const annee = parseInt(m[1], 10);
  const mois = parseInt(m[2], 10);
  return mois >= 1 && mois <= 12 ? [annee, mois] : null;
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
  let cc;
  if (bail.loyer_cc != null) {
    cc = bail.loyer_cc;
  } else if (bail.loyer_hc != null || bail.charges != null) {
    cc = (bail.loyer_hc ?? 0) + (bail.charges ?? 0);
  } else {
    return null;
  }
  return Math.round(cc * 100) / 100;
}
function montantAttendu(bail, periode) {
  const plein = loyerCcPlein(bail);
  if (plein === null)
    return null;
  const parsee = parsePeriode(periode);
  if (parsee === null)
    return plein;
  const periodeDebut = periodeDeDateIso(bail.date_debut_bail);
  if (periodeDebut === null || periodeDebut !== periode)
    return plein;
  const jourEntree = jourDeDateIso(bail.date_debut_bail);
  if (jourEntree === null || jourEntree <= 1)
    return plein;
  const [annee, mois] = parsee;
  const occupe = joursOccupes(jourEntree, annee, mois);
  return Math.round(plein * occupe / joursDansMois(annee, mois) * 100) / 100;
}
export {
  montantAttendu,
  simulerRattrapageIrl
};
