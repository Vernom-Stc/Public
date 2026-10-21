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
      id: "tel",
      label: "Numéros de téléphone",
      type: "TEL",
      re: /(?:\+41|0041|\b0)\s?\(?\d{2}\)?[\s.]?\d{3}[\s.]?\d{2}[\s.]?\d{2}\b/g
    }
  );
})();
