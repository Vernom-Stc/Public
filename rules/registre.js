/*
 * Kerckhoffs — registre des règles de détection.
 *
 * Les règles communes à tous les pays sont dans rules/commun.js.
 * Chaque pays a son propre fichier dans rules/pays/ (ex. rules/pays/ch.js pour la Suisse).
 * Pour ajouter un pays, lisez rules/LISEZMOI.md.
 *
 * Format d'une règle :
 *   id       identifiant unique dans le fichier, ex. "avs"
 *   label    texte affiché à l'utilisateur, ex. "Numéros AVS"
 *   type     préfixe du jeton : "AVS" donne [AVS_1]
 *   re       expression régulière, avec le drapeau g
 *   check    (facultatif) fonction qui valide ce qui a été trouvé (chiffre de contrôle…)
 *   silent   (facultatif) avec check : ignorer au lieu de signaler « à relire »
 *   exemples { trouve: [...], ignore: [...] } : textes qui DOIVENT être trouvés, ou NE DOIVENT PAS l'être.
 *            Ils sont vérifiés automatiquement par rules/tester.js.
 */
(function (g) {
  var K = (g.Kerckhoffs = g.Kerckhoffs || { commun: [], pays: {}, cerbere: { regles: [], sensibles: [] } });
  K.ajouterCerbere = function (c) {
    K.cerbere.regles.push.apply(K.cerbere.regles, c.regles || []);
    K.cerbere.sensibles.push.apply(K.cerbere.sensibles, c.sensibles || []);
  };
  K.ajouterCommun = function (regles) { K.commun.push.apply(K.commun, regles); };
  K.ajouterPays = function (p) {
    if (!p || !p.code || !p.nom || !Array.isArray(p.regles)) throw new Error("Pays mal décrit : il faut code, nom et regles.");
    K.pays[p.code] = p;
  };
})(typeof window !== "undefined" ? window : globalThis);
