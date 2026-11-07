// essais/best-of-n/attempt-4/impl-revision.ts
var centimes = (x) => Math.round(x * 100) / 100;
function dateDebut(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m)
    return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function indice(table, cle) {
  if (!table)
    return void 0;
  if (typeof table.get === "function") {
    return table.get(cle);
  }
  return table[cle];
}
function trimestreIndexation(bail, debut) {
  const match = /\bT([1-4])\b/.exec(bail.trimestreRef ?? "");
  if (match)
    return Number(match[1]);
  return 1 + Math.floor(debut.getMonth() / 3);
}
function simulerRattrapageIrl(baux, anneeDepart, irlParTrimestre, tauxFixeAnnuel) {
  const maintenant = /* @__PURE__ */ new Date();
  const anneeCourante = maintenant.getFullYear();
  return baux.map((bail) => {
    const aLIdentique = () => ({
      bailId: bail.bailId,
      designation: bail.designation,
      locataire: bail.locataire,
      loyerActuel: bail.loyerHcActuel,
      loyerSimule: bail.loyerHcActuel,
      deltaMois: 0,
      deltaAn: 0,
      revisionsJouees: 0
    });
    const debut = dateDebut(bail.dateDebutBail);
    if (debut === null || !(bail.loyerHcActuel > 0))
      return aLIdentique();
    const trimestre = trimestreIndexation(bail, debut);
    let loyer = bail.loyerHcActuel;
    let revisionsJouees = 0;
    for (let annee = anneeDepart; annee <= anneeCourante; annee++) {
      const dernierJour = new Date(annee, debut.getMonth() + 1, 0).getDate();
      const anniversaire = new Date(annee, debut.getMonth(), Math.min(debut.getDate(), dernierJour));
      if (anniversaire.getTime() <= debut.getTime())
        continue;
      if (anniversaire.getTime() > maintenant.getTime())
        continue;
      let ratio = null;
      if (irlParTrimestre) {
        const precedent = indice(irlParTrimestre, `${annee - 1}-Q${trimestre}`);
        const courant = indice(irlParTrimestre, `${annee}-Q${trimestre}`);
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

// essais/best-of-n/attempt-4/impl-prorata.ts
function renseigne(v) {
  return v !== null && v !== void 0;
}
function joursDuMois(annee, mois1_12) {
  return new Date(annee, mois1_12, 0).getDate();
}
function anMoisDePeriode(periode) {
  const morceaux = periode.split("-");
  return [parseInt(morceaux[0], 10), parseInt(morceaux[1] ?? "", 10)];
}
function moisDebut(iso) {
  if (!iso)
    return null;
  const m = /^(\d{4}-\d{2})/.exec(iso);
  return m ? m[1] : null;
}
function jourEntree(iso) {
  if (!iso)
    return null;
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso);
  const j = m ? parseInt(m[1], 10) : NaN;
  return j >= 1 && j <= 31 ? j : null;
}
function loyerCcPlein(bail) {
  let cc;
  if (renseigne(bail.loyer_cc)) {
    cc = bail.loyer_cc;
  } else if (renseigne(bail.loyer_hc) || renseigne(bail.charges)) {
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
  const [annee, mois] = anMoisDePeriode(periode);
  if (Number.isNaN(annee) || Number.isNaN(mois))
    return plein;
  if (moisDebut(bail.date_debut_bail) !== periode)
    return plein;
  const jour = jourEntree(bail.date_debut_bail);
  if (jour === null || jour <= 1)
    return plein;
  const total = joursDuMois(annee, mois);
  const j = Math.min(Math.max(Math.trunc(jour), 1), total);
  const occupes = total - j + 1;
  return Math.round(plein * occupes / total * 100) / 100;
}
export {
  montantAttendu,
  simulerRattrapageIrl
};
