/*
 * Kerckhoffs — MODÈLE pour ajouter un pays.  /  TEMPLATE to add a country.
 *
 * 1. Copiez ce fichier sous le code ISO du pays, ex. rules/pays/in.js pour l'Inde.
 *    Copy this file using the country's ISO code, e.g. rules/pays/in.js for India.
 * 2. Remplissez code, nom et les règles. Donnez des exemples : ils servent de tests.
 *    Fill in code, name and rules. Give examples: they are the tests.
 * 3. Ajoutez le fichier dans index.html et dans sw.js (liste FILES).
 *    Add the file to index.html and to sw.js (FILES list).
 * 4. Lancez : node rules/tester.js   /   Run: node rules/tester.js
 *
 * Ce fichier n'est pas chargé par l'application.  /  This file is not loaded by the app.
 */
(function () {
  Kerckhoffs.ajouterPays({
    code: "XX",          // code ISO à deux lettres / two-letter ISO code
    nom: "Nom du pays",  // affiché dans Réglages / shown in Settings
    regles: [
      {
        id: "codepostal",
        label: "Codes postaux",
        type: "ADRESSE",
        // Exemple : l'Inde utilise un code PIN à 6 chiffres. / Example: India uses a 6-digit PIN code.
        re: /\b[1-9]\d{5}\b/g,
        exemples: { trouve: ["110001"], ignore: ["12345"] }
      }
      // Autres idées / other ideas : numéro d'identité national (avec son chiffre de contrôle),
      // téléphones, plaques, numéros fiscaux… Une règle = une forme reconnaissable.
    ]
  });
})();
