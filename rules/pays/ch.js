/*
 * Kerckhoffs — Suisse (CH).
 * Format d'une règle : voir rules/registre.js. Pour un autre pays : rules/LISEZMOI.md.
 */
(function () {
  // Numéro AVS : 756.XXXX.XXXX.XC, chiffre de contrôle EAN-13
  // La lecture d'une photo confond parfois des chiffres et des lettres : O→0, l/I→1, S→5, B→8.
  function chiffres(s) { return s.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/\D/g, ""); }
  function avsValide(s) {
    var d = chiffres(s);
    if (d.length !== 13) return false;
    var somme = 0;
    for (var i = 0; i < 12; i++) somme += (+d[i]) * (i % 2 ? 3 : 1);
    return (10 - (somme % 10)) % 10 === +d[12];
  }

  // IBAN : contrôle modulo 97
  function ibanValide(s) {
    var t = s.replace(/\s/g, "").toUpperCase();
    if (t.length < 15) return false;
    var r = (t.slice(4) + t.slice(0, 4)).replace(/[A-Z]/g, function (c) { return c.charCodeAt(0) - 55; });
    var reste = 0;
    for (var i = 0; i < r.length; i++) reste = (reste * 10 + +r[i]) % 97;
    return reste === 1;
  }

  // Mots qui suivent souvent une année ou un montant, et ne sont pas une localité
  var PAS_UNE_LOCALITE = /^(vous|nous|le|la|les|un|une|des|du|de|et|en|au|aux|total|chf|eur|fr|frs|tva|pce|pces|mg|ml|monsieur|madame|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)$/i;
  function localiteValide(s) {
    var m = s.match(/(\d{4})\s+(\S+)/);
    if (!m) return true;
    return !PAS_UNE_LOCALITE.test(m[2].replace(/[.,;:]$/, ""));
  }

  Kerckhoffs.ajouterPays({
    code: "CH",
    nom: "Suisse",
    regles: [
      {
        id: "avs",
        label: "Numéros AVS",
        type: "AVS",
        // Tolérant aux séparateurs (points, espaces, virgules) et aux erreurs de lecture courantes
        re: /\b756(?:[\s.,·:-]{0,2}[0-9OoIlSB]){10}\b/g,
        check: avsValide,
        exemples: { trouve: ["756.9217.0769.85", "756 9217 0769 85", "756.92l7.O769.85"], ignore: ["7561234"] }
      },
      {
        id: "iban",
        label: "IBAN suisses",
        type: "IBAN",
        re: /\b(?:CH|LI)\s?\d{2}(?:\s?[0-9A-Z]){17}\b/gi,
        check: ibanValide,
        exemples: { trouve: ["CH93 0076 2011 6238 5295 7"], ignore: [] }
      },
      {
        // Rue, route, avenue, chemin… suivie d'un numéro
        id: "rue",
        label: "Adresses (rue et numéro)",
        type: "ADRESSE",
        re: /\b(?:rue|route|rte|avenue|av\.|chemin|ch\.|boulevard|bd|place|pl\.|quai|impasse|allée|allee|sentier|ruelle|promenade|passage|clos|esplanade|square)\s+(?:[A-Za-zÀ-ÿ'’.-]+\s+){0,4}\d{1,4}[a-zA-Z]?\b/gi,
        exemples: { trouve: ["Rue des Epinettes 20", "Chemin de la Gravière 4"], ignore: ["Total CHF 19.60"] }
      },
      {
        // Version alémanique
        id: "strasse",
        label: "Adresses (Strasse, Weg, Gasse…)",
        type: "ADRESSE",
        re: /\b[A-ZÄÖÜ][a-zäöüß-]*(?:strasse|straße|gasse|weg|platz|allee|ring)\s+\d{1,4}[a-zA-Z]?\b/g,
        exemples: { trouve: ["Bahnhofstrasse 12"], ignore: [] }
      },
      {
        // Code postal (NPA) et localité
        id: "npa",
        label: "Codes postaux et localités",
        type: "ADRESSE",
        re: /(?:\bCH-?\s?)?\b[1-9]\d{3}\s+[A-ZÀ-Ü][A-Za-zÀ-ÿ'’-]+(?:[\s-]+(?:sur|sous|en|de|la|le|les)?\s*[A-ZÀ-Ü][a-zà-ÿ'’-]+)?/g,
        check: localiteValide,
        silent: true,
        exemples: { trouve: ["1227 Carouge", "CH-1211 Genève"], ignore: ["2025 Vous"] }
      },
      {
        id: "tel",
        label: "Numéros de téléphone",
        type: "TEL",
        re: /(?:\+41|0041|\b0)\s?\(?\d{2}\)?[\s.]?\d{3}[\s.]?\d{2}[\s.]?\d{2}\b/g,
        exemples: { trouve: ["021 555 12 34", "+41 21 555 12 34"], ignore: [] }
      }
    ]
  });
})();
