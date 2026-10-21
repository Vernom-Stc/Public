/*
 * Kerckhoffs — règles de détection pour la Suisse.
 * Voir rules/commun.js pour le format d'une règle.
 */
(function () {
  // Numéro AVS : 756.XXXX.XXXX.XC, chiffre de contrôle EAN-13
  function avsValide(s) {
    var d = s.replace(/\D/g, "");
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

  window.KERCKHOFFS_RULES = window.KERCKHOFFS_RULES || [];
  window.KERCKHOFFS_RULES.push(
    {
      id: "avs",
      label: "Numéros AVS",
      type: "AVS",
      re: /756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}/g,
      check: avsValide
    },
    {
      id: "iban",
      label: "IBAN suisses",
      type: "IBAN",
      re: /\b(?:CH|LI)\s?\d{2}(?:\s?[0-9A-Z]){17}\b/gi,
      check: ibanValide
    },
    {
      // Rue, route, avenue, chemin… suivie d'un numéro : « Rue des Epinettes 20 »
      id: "rue",
      label: "Adresses (rue et numéro)",
      type: "ADRESSE",
      re: /\b(?:rue|route|rte|avenue|av\.|chemin|ch\.|boulevard|bd|place|pl\.|quai|impasse|allée|allee|sentier|ruelle|promenade|passage|clos|esplanade|square)\s+(?:[A-Za-zÀ-ÿ'’.-]+\s+){0,4}\d{1,4}[a-zA-Z]?\b/gi
    },
    {
      // Version alémanique : « Bahnhofstrasse 12 »
      id: "strasse",
      label: "Adresses (Strasse, Weg, Gasse…)",
      type: "ADRESSE",
      re: /\b[A-ZÄÖÜ][a-zäöüß-]*(?:strasse|straße|gasse|weg|platz|allee|ring)\s+\d{1,4}[a-zA-Z]?\b/g
    },
    {
      // Code postal et localité : « 1227 Carouge », « CH-1211 Genève »
      id: "npa",
      label: "Codes postaux et localités",
      type: "ADRESSE",
      re: /(?:\bCH-?\s?)?\b[1-9]\d{3}\s+[A-ZÀ-Ü][A-Za-zÀ-ÿ'’-]+(?:[\s-]+(?:sur|sous|en|de|la|le|les)?\s*[A-ZÀ-Ü][a-zà-ÿ'’-]+)?/g,
      check: localiteValide,
      silent: true
    },
    {
      id: "tel",
      label: "Numéros de téléphone",
      type: "TEL",
      re: /(?:\+41|0041|\b0)\s?\(?\d{2}\)?[\s.]?\d{3}[\s.]?\d{2}[\s.]?\d{2}\b/g
    }
  );
})();
