#!/usr/bin/env node
/*
 * Kerckhoffs — vérifie toutes les règles de détection.  /  Checks every detection rule.
 *
 *   node rules/tester.js
 *
 * Pour chaque règle : chaque exemple « trouve » doit être reconnu en entier,
 * et aucun exemple « ignore » ne doit l'être.
 * Vérifie aussi que chaque pays est bien déclaré dans index.html et sw.js.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const racine = path.join(__dirname, "..");
const lire = (f) => fs.readFileSync(path.join(racine, f), "utf8");
let erreurs = 0;
const ko = (msg) => { erreurs++; console.log("  ✗ " + msg); };

function charger(fichiers) {
  const ctx = { window: {} };
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(lire("rules/registre.js"), ctx);
  ctx.Kerckhoffs = ctx.window.Kerckhoffs;
  fichiers.forEach((f) => vm.runInContext(lire(f), ctx, { filename: f }));
  return ctx.window.Kerckhoffs;
}

function trouve(regle, texte) {
  regle.re.lastIndex = 0;
  let m;
  while ((m = regle.re.exec(texte))) {
    const v = m[0].trim();
    const valide = !regle.check || regle.check(v);
    if (valide || !regle.silent) return v;
  }
  return null;
}

function tester(nom, regles) {
  console.log(nom);
  const ids = new Set();
  for (const r of regles) {
    if (!r.id || !r.label || !r.type || Object.prototype.toString.call(r.re) !== "[object RegExp]") { ko(`règle incomplète : ${r.id || "?"}`); continue; }
    if (ids.has(r.id)) ko(`identifiant en double : ${r.id}`);
    ids.add(r.id);
    if (!r.re.global) ko(`${r.id} : l'expression doit avoir le drapeau g`);
    const ex = r.exemples || {};
    if (!ex.trouve || !ex.trouve.length) ko(`${r.id} : ajoutez au moins un exemple « trouve »`);
    for (const t of ex.trouve || []) {
      const v = trouve(r, t);
      if (v !== t.trim()) ko(`${r.id} : « ${t} » devrait être trouvé en entier (obtenu : ${v === null ? "rien" : "« " + v + " »"})`);
      else if (r.check && !r.check(v)) ko(`${r.id} : « ${t} » est trouvé mais refusé par check`);
    }
    for (const t of ex.ignore || []) {
      const v = trouve(r, t);
      if (v !== null && (!r.check || r.check(v))) ko(`${r.id} : « ${t} » ne devrait pas être trouvé (obtenu : « ${v} »)`);
    }
  }
  console.log(`  ${regles.length} règle(s) vérifiée(s)`);
}

const paysFichiers = fs.readdirSync(path.join(racine, "rules/pays")).filter((f) => f.endsWith(".js") && !f.startsWith("_")).map((f) => "rules/pays/" + f);
const K = charger(["rules/commun.js", "rules/cerbere.js", "rules/etiquettes.js", ...paysFichiers]);
tester("Commun", K.commun);
tester("Cerbère", K.cerbere.regles);
if (!K.cerbere.sensibles.length) ko("Cerbère : la liste des mots sensibles est vide");
console.log("Étiquettes");
for (const e of K.etiquettes) {
  const ex = e.exemples || {};
  if (!ex.trouve || !ex.trouve.length) ko(`${e.id} : ajoutez au moins un exemple « trouve »`);
  for (const [texte, attendu] of ex.trouve || []) {
    const v = K.valeursApresEtiquettes(texte).map((x) => x.valeur);
    if (!v.includes(attendu)) ko(`${e.id} : dans « ${texte} », la valeur attendue est « ${attendu} » (obtenu : ${v.length ? v.map((x) => "« " + x + " »").join(", ") : "rien"})`);
  }
  for (const texte of ex.ignore || []) {
    const v = K.valeursApresEtiquettes(texte).filter((x) => x.etiquette.id === e.id);
    if (v.length) ko(`${e.id} : « ${texte} » ne devrait rien donner (obtenu : « ${v[0].valeur} »)`);
  }
}
console.log(`  ${K.etiquettes.length} groupe(s) d'étiquettes vérifié(s)`);
for (const code of Object.keys(K.pays)) tester(`${K.pays[code].nom} (${code})`, K.pays[code].regles);

console.log("Ressemblance (mots de Réglages, malgré les erreurs de lecture)");
for (const [lu, cherche] of K.exemplesRessemblance.trouve) if (!K.ressemble(lu, cherche)) ko(`« ${lu} » devrait être reconnu comme « ${cherche} »`);
for (const [lu, cherche] of K.exemplesRessemblance.ignore) if (K.ressemble(lu, cherche) && K.motsACherche(cherche).length) ko(`« ${lu} » ne devrait pas être pris pour « ${cherche} »`);
if (K.motsACherche("12 rue Louis-De-Montfalcon").join(",") !== "Louis,Montfalcon") ko(`motsACherche : obtenu « ${K.motsACherche("12 rue Louis-De-Montfalcon")} »`);

// Le modèle doit rester valide, puisqu'on le copie.
const modele = charger(["rules/pays/_modele.js"]);
for (const code of Object.keys(modele.pays)) tester("Modèle (_modele.js)", modele.pays[code].regles);

// Chaque pays doit être chargé par l'application et gardé pour le mode avion.
console.log("Déclarations");
const html = lire("index.html"), sw = lire("sw.js");
for (const f of ["rules/registre.js", "rules/commun.js", "rules/cerbere.js", "rules/etiquettes.js", ...paysFichiers]) {
  if (!html.includes(`src="${f}"`)) ko(`${f} manque dans index.html`);
  if (!sw.includes(`"${f}"`)) ko(`${f} manque dans sw.js (liste FILES)`);
}

console.log(erreurs ? `\n${erreurs} problème(s) à corriger.` : "\nTout est bon.");
process.exit(erreurs ? 1 : 0);
