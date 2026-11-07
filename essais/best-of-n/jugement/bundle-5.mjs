// essais/best-of-n/attempt-5/impl-revision.ts
var auCentime = (x) => Math.round(x * 100) / 100;
function dateDebut(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  if (!m)
    return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
var dernierJourMois = (annee, mois0) => new Date(annee, mois0 + 1, 0).getDate();
function trimestreDindexation(trimestreRef, debut) {
  const m = /\bT([1-4])\b/.exec(trimestreRef ?? "");
  return m ? Number(m[1]) : 1 + Math.floor(debut.getMonth() / 3);
}
function lecteurIndices(src) {
  if (!src)
    return null;
  if (typeof src.get === "function") {
    return (cle) => src.get(cle);
  }
  const obj = src;
  return (cle) => obj[cle];
}
function ratioAnnuel(annee, trimestre, indice, tauxFixeAnnuel) {
  if (indice) {
    const prec = indice(`${annee - 1}-Q${trimestre}`);
    const cour = indice(`${annee}-Q${trimestre}`);
    if (prec === void 0 || cour === void 0 || !Number.isFinite(prec) || !Number.isFinite(cour) || prec <= 0 || cour <= 0) {
      return null;
    }
    return cour / prec;
  }
  return tauxFixeAnnuel !== null && tauxFixeAnnuel !== void 0 && Number.isFinite(tauxFixeAnnuel) ? 1 + tauxFixeAnnuel / 100 : null;
}
function simulerRattrapageIrl(baux, anneeDepart, irlParTrimestre, tauxFixeAnnuel) {
  const anneeCourante = (/* @__PURE__ */ new Date()).getFullYear();
  const indice = lecteurIndices(irlParTrimestre);
  const maintenant = /* @__PURE__ */ new Date();
  return (baux ?? []).map((bail) => {
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
    const debut = dateDebut(bail.dateDebutBail);
    if (debut === null || !(bail.loyerHcActuel > 0))
      return identite;
    const trimestre = trimestreDindexation(bail.trimestreRef, debut);
    let loyer = bail.loyerHcActuel;
    let revisionsJouees = 0;
    for (let annee = anneeDepart; annee <= anneeCourante; annee++) {
      const jour = Math.min(debut.getDate(), dernierJourMois(annee, debut.getMonth()));
      const anniversaire = new Date(annee, debut.getMonth(), jour);
      if (anniversaire <= debut)
        continue;
      if (anniversaire > maintenant)
        continue;
      const ratio = ratioAnnuel(annee, trimestre, indice, tauxFixeAnnuel);
      if (ratio === null)
        continue;
      loyer = auCentime(loyer * ratio);
      revisionsJouees++;
    }
    const deltaMois = auCentime(loyer - bail.loyerHcActuel);
    return {
      ...identite,
      loyerSimule: loyer,
      deltaMois,
      deltaAn: auCentime(deltaMois * 12),
      revisionsJouees
    };
  });
}

// essais/best-of-n/attempt-5/impl-prorata.ts
var auCentime2 = (x) => Math.round(x * 100) / 100;
function loyerPlein(bail) {
  const hc = bail.loyer_hc ?? null;
  const charges = bail.charges ?? null;
  const cc = bail.loyer_cc ?? (hc !== null || charges !== null ? (hc ?? 0) + (charges ?? 0) : null);
  return cc === null ? null : auCentime2(cc);
}
function decouperPeriode(periode) {
  const [a, m] = String(periode ?? "").split("-").map((x) => parseInt(x, 10));
  return [a, m];
}
function moisDeDateIso(iso) {
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
var joursDansMois = (annee, mois) => new Date(annee, mois, 0).getDate();
function montantAttendu(bail, periode) {
  const plein = loyerPlein(bail);
  if (plein === null)
    return null;
  const [annee, mois] = decouperPeriode(periode);
  if (Number.isNaN(annee) || Number.isNaN(mois))
    return plein;
  const dateDebut2 = bail.date_debut_bail ?? null;
  if (moisDeDateIso(dateDebut2) !== periode)
    return plein;
  const jourEntree = jourDeDateIso(dateDebut2);
  if (jourEntree === null || jourEntree <= 1)
    return plein;
  const total = joursDansMois(annee, mois);
  const occupes = total - Math.min(Math.max(Math.trunc(jourEntree), 1), total) + 1;
  return auCentime2(plein * occupes / total);
}
export {
  montantAttendu,
  simulerRattrapageIrl
};
