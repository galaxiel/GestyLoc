// essais/best-of-n/attempt-7/impl-revision.ts
function centimes(x) {
  return Math.round(x * 100) / 100;
}
function joursDansMois(annee, mois) {
  return new Date(annee, mois, 0).getDate();
}
function decomposerIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m)
    return null;
  const annee = parseInt(m[1], 10);
  const mois = parseInt(m[2], 10);
  const jour = parseInt(m[3], 10);
  if (mois < 1 || mois > 12 || jour < 1)
    return null;
  return { annee, mois, jour: Math.min(jour, joursDansMois(annee, mois)) };
}
function trimestreDeReference(s) {
  const m = (s ?? "").match(/\bT([1-4])\b/);
  return m ? parseInt(m[1], 10) : null;
}
function cleDate(annee, mois, jour) {
  return annee * 1e4 + mois * 100 + jour;
}
function simulerRattrapageIrl(baux, anneeDepart, irlParTrimestre, tauxFixeAnnuel) {
  const maintenant = /* @__PURE__ */ new Date();
  const anneeCourante = maintenant.getFullYear();
  const aujourdhui = cleDate(
    anneeCourante,
    maintenant.getMonth() + 1,
    maintenant.getDate()
  );
  return baux.map((bail) => {
    const aLIdentique = {
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: bail.loyerHcActuel,
      deltaMois: 0,
      deltaAn: 0,
      revisionsJouees: 0
    };
    const debut = decomposerIso(bail.dateDebutBail);
    if (debut === null || !(bail.loyerHcActuel > 0))
      return aLIdentique;
    const trimestre = trimestreDeReference(bail.trimestreRef) ?? 1 + Math.floor((debut.mois - 1) / 3);
    let loyer = bail.loyerHcActuel;
    let revisionsJouees = 0;
    for (let annee = anneeDepart; annee <= anneeCourante; annee++) {
      if (annee <= debut.annee)
        continue;
      const jourAnniversaire = Math.min(
        debut.jour,
        joursDansMois(annee, debut.mois)
      );
      if (cleDate(annee, debut.mois, jourAnniversaire) > aujourdhui)
        continue;
      let ratio = null;
      if (irlParTrimestre !== null) {
        const precedent = irlParTrimestre.get(`${annee - 1}-Q${trimestre}`);
        const courant = irlParTrimestre.get(`${annee}-Q${trimestre}`);
        if (precedent !== void 0 && courant !== void 0 && precedent > 0 && courant > 0) {
          ratio = courant / precedent;
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

// essais/best-of-n/attempt-7/impl-prorata.ts
function centimes2(x) {
  return Math.round(x * 100) / 100;
}
function joursDansMois2(annee, mois) {
  return new Date(annee, mois, 0).getDate();
}
function loyerPlein(bail) {
  if (bail.loyer_cc != null)
    return centimes2(bail.loyer_cc);
  if (bail.loyer_hc != null || bail.charges != null) {
    return centimes2((bail.loyer_hc ?? 0) + (bail.charges ?? 0));
  }
  return null;
}
function parserPeriode(periode) {
  const m = /^(\d{4})-(\d{2})$/.exec(periode ?? "");
  if (!m)
    return null;
  const annee = parseInt(m[1], 10);
  const mois = parseInt(m[2], 10);
  return mois >= 1 && mois <= 12 ? [annee, mois] : null;
}
function parserDateIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m)
    return null;
  const jour = parseInt(m[3], 10);
  if (jour < 1 || jour > 31)
    return null;
  return { periode: `${m[1]}-${m[2]}`, jour };
}
function montantAttendu(bail, periode) {
  const plein = loyerPlein(bail);
  if (plein === null)
    return null;
  const periodeCible = parserPeriode(periode);
  if (periodeCible === null)
    return plein;
  const [annee, mois] = periodeCible;
  const debut = parserDateIso(bail.date_debut_bail);
  if (debut === null || debut.periode !== periode)
    return plein;
  if (debut.jour <= 1)
    return plein;
  const total = joursDansMois2(annee, mois);
  const jourEntree = Math.min(Math.max(debut.jour, 1), total);
  const joursOccupes = total - jourEntree + 1;
  return centimes2(plein * joursOccupes / total);
}
export {
  montantAttendu,
  simulerRattrapageIrl
};
