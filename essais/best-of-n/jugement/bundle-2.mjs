// essais/best-of-n/attempt-2/impl-revision.ts
var RE_TRIMESTRE_REF = /\bT([1-4])\b/;
var JOURS_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function bissextile(annee) {
  return annee % 4 === 0 && annee % 100 !== 0 || annee % 400 === 0;
}
function joursDansMois(annee, mois1_12) {
  if (mois1_12 === 2)
    return bissextile(annee) ? 29 : 28;
  return JOURS_MOIS[mois1_12 - 1] ?? 31;
}
function centimes(x) {
  return Math.round(x * 100) / 100;
}
function parserDateLocale(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m)
    return null;
  const d = new Date(
    parseInt(m[1] ?? "", 10),
    parseInt(m[2] ?? "", 10) - 1,
    parseInt(m[3] ?? "", 10)
  );
  return Number.isNaN(d.getTime()) ? null : d;
}
function indice(table, cle) {
  if (table === null || table === void 0)
    return void 0;
  if (typeof table.get === "function") {
    return table.get(cle);
  }
  return table[cle];
}
function ratioRevision(y, trimestre, irlParTrimestre, tauxFixeAnnuel) {
  if (irlParTrimestre) {
    const prec = indice(irlParTrimestre, `${y - 1}-Q${trimestre}`);
    const cour = indice(irlParTrimestre, `${y}-Q${trimestre}`);
    if (prec === void 0 || cour === void 0)
      return null;
    if (!(prec > 0) || !(cour > 0))
      return null;
    return cour / prec;
  }
  if (tauxFixeAnnuel !== null && tauxFixeAnnuel !== void 0) {
    return 1 + tauxFixeAnnuel / 100;
  }
  return null;
}
function anniversaire(y, mois1_12, jour) {
  const jourBorne = Math.min(jour, joursDansMois(y, mois1_12));
  return new Date(y, mois1_12 - 1, jourBorne);
}
function simulerRattrapageIrl(baux, anneeDepart, irlParTrimestre, tauxFixeAnnuel) {
  const maintenant = /* @__PURE__ */ new Date();
  const anneeCourante = maintenant.getFullYear();
  return baux.map((bail) => {
    const debut = parserDateLocale(bail.dateDebutBail);
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
    let trimestre = Math.floor(debut.getMonth() / 3) + 1;
    const matchRef = (bail.trimestreRef ?? "").match(RE_TRIMESTRE_REF);
    if (matchRef)
      trimestre = parseInt(matchRef[1] ?? "", 10);
    let loyer = bail.loyerHcActuel;
    let revisionsJouees = 0;
    for (let y = anneeDepart; y <= anneeCourante; y++) {
      const echeance = anniversaire(y, debut.getMonth() + 1, debut.getDate());
      if (echeance.getTime() <= debut.getTime())
        continue;
      if (echeance.getTime() > maintenant.getTime())
        continue;
      const ratio = ratioRevision(y, trimestre, irlParTrimestre, tauxFixeAnnuel);
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

// essais/best-of-n/attempt-2/impl-prorata.ts
var JOURS_MOIS2 = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function bissextile2(annee) {
  return annee % 4 === 0 && annee % 100 !== 0 || annee % 400 === 0;
}
function joursDansMois2(annee, mois1_12) {
  if (mois1_12 === 2)
    return bissextile2(annee) ? 29 : 28;
  return JOURS_MOIS2[mois1_12 - 1] ?? 31;
}
function loyerCcPlein(bail) {
  const hcRenseigne = bail.loyer_hc != null;
  const chargesRenseignees = bail.charges != null;
  let cc;
  if (bail.loyer_cc != null) {
    cc = bail.loyer_cc;
  } else if (hcRenseigne || chargesRenseignees) {
    cc = (bail.loyer_hc ?? 0) + (bail.charges ?? 0);
  } else {
    cc = null;
  }
  return cc === null ? null : Math.round(cc * 100) / 100;
}
function joursOccupes(jourEntree, annee, mois1_12) {
  const total = joursDansMois2(annee, mois1_12);
  const j = Math.min(Math.max(Math.trunc(jourEntree), 1), total);
  return total - j + 1;
}
function parserPeriode(periode) {
  const morceaux = String(periode).split("-");
  const annee = parseInt(morceaux[0] ?? "", 10);
  const mois = parseInt(morceaux[1] ?? "", 10);
  return [annee, mois];
}
function periodeDebut(iso) {
  if (!iso)
    return null;
  const m = /^(\d{4})-(\d{2})/.exec(String(iso));
  return m ? `${m[1]}-${m[2]}` : null;
}
function jourDebut(iso) {
  if (!iso)
    return null;
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(String(iso));
  const j = m ? parseInt(m[1] ?? "", 10) : NaN;
  return j >= 1 && j <= 31 ? j : null;
}
function montantAttendu(bail, periode) {
  const plein = loyerCcPlein(bail);
  if (plein === null)
    return null;
  const [annee, mois] = parserPeriode(periode);
  if (Number.isNaN(annee) || Number.isNaN(mois))
    return plein;
  const periodeEntree = periodeDebut(bail.date_debut_bail);
  if (periodeEntree === null || periodeEntree !== periode)
    return plein;
  const jourEntree = jourDebut(bail.date_debut_bail);
  if (jourEntree === null || jourEntree <= 1)
    return plein;
  const occupe = joursOccupes(jourEntree, annee, mois);
  return Math.round(plein * occupe / joursDansMois2(annee, mois) * 100) / 100;
}
export {
  montantAttendu,
  simulerRattrapageIrl
};
