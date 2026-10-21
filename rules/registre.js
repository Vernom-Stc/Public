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
  // Étiquettes de formulaire : « Nom : », « Né le », « Patient : »… Ce qui suit est probablement une donnée personnelle.
  K.etiquettes = K.etiquettes || [];
  K.ajouterEtiquettes = function (liste) { K.etiquettes.push.apply(K.etiquettes, liste); };
  var sansAccent = function (s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); };
  // Renvoie, pour une ligne de texte, les valeurs qui suivent une étiquette : [{ etiquette, debut, fin, valeur }]
  K.valeursApresEtiquettes = function (ligne) {
    var trouves = [];
    K.etiquettes.forEach(function (e) {
      // Sans « : », on garde les accents : « né le » ne doit pas se confondre avec « ne le ».
      var prep = e.sansDeuxPoints ? function (s) { return s.toLowerCase(); } : sansAccent;
      var n = prep(ligne);
      e.mots.forEach(function (mot) {
        var m = prep(mot), de = 0, i;
        while ((i = n.indexOf(m, de)) > -1) {
          de = i + 1;
          if (i > 0 && /[a-z0-9]/.test(n[i - 1])) continue;          // début de mot
          var j = i + m.length;
          if (/[a-z0-9]/.test(n[j] || "")) continue;                  // fin de mot (« nom » ≠ « nombre »)
          var apres = n.slice(j).match(/^\.?\s*(:)?\s*/); // « Tél. : », « Nom: », « Né le »
          var deuxPoints = !!apres[1];
          if (!deuxPoints && !e.sansDeuxPoints) continue;            // « Nom : » oui, « le nom de » non
          var debut = j + apres[0].length;
          trouves.push({ etiquette: e, debutEtiquette: i, debut: debut });
        }
      });
    });
    trouves.sort(function (a, b) { return a.debutEtiquette - b.debutEtiquette; });
    // La valeur va jusqu'à l'étiquette suivante sur la même ligne, ou jusqu'au bout de la ligne.
    return trouves.map(function (t, k) {
      var suivante = trouves.slice(k + 1).find(function (x) { return x.debutEtiquette >= t.debut; });
      var fin = suivante ? suivante.debutEtiquette : ligne.length;
      var valeur = ligne.slice(t.debut, fin).replace(/[\s,;]+$/, "");
      return { etiquette: t.etiquette, debut: t.debut, fin: t.debut + valeur.length, valeur: valeur };
    }).filter(function (v) { return /[A-Za-zÀ-ÿ0-9]/.test(v.valeur); });
  };
  K.ajouterCerbere = function (c) {
    K.cerbere.regles.push.apply(K.cerbere.regles, c.regles || []);
    K.cerbere.sensibles.push.apply(K.cerbere.sensibles, c.sensibles || []);
  };
  K.ajouterCommun = function (regles) { K.commun.push.apply(K.commun, regles); };
  K.ajouterPays = function (p) {
    if (!p || !p.code || !p.nom || !Array.isArray(p.regles)) throw new Error("Pays mal décrit : il faut code, nom et regles.");
    K.pays[p.code] = p;
  };

  /* ---- Retrouver les mots que vous avez écrits dans « Réglages », malgré les erreurs de lecture ----
   * La lecture d'une photo confond souvent certaines lettres et chiffres (O et 0, l et 1, S et 5…)
   * ou se trompe d'une lettre. Un mot lu « ressemble » au mot cherché s'il ne diffère que de peu :
   *   - 3 ou 4 caractères : identique (après les confusions ci-dessous) ;
   *   - 5 à 8 caractères : une erreur au plus ;
   *   - 9 caractères ou plus : deux erreurs au plus.
   */
  var CONFUSIONS = { "0": "o", "q": "o", "1": "i", "l": "i", "|": "i", "!": "i", "5": "s", "8": "b", "2": "z", "6": "b" };
  function simplifier(mot) {
    return String(mot).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
      .replace(/[0-9a-z|!]/g, function (c) { return CONFUSIONS[c] || c; });
  }
  function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prec = [], i, j;
    for (j = 0; j <= b.length; j++) prec[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cour = [i], mini = i;
      for (j = 1; j <= b.length; j++) {
        cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cour[j] < mini) mini = cour[j];
      }
      if (mini > max) return max + 1;
      prec = cour;
    }
    return prec[b.length];
  }
  K.ressemble = function (motLu, motCherche) {
    var a = simplifier(motLu), b = simplifier(motCherche);
    if (b.length < 3 || !a) return false;
    var max = b.length >= 9 ? 2 : b.length >= 5 ? 1 : 0;
    return distance(a, b, max) <= max;
  };
  // Les mots d'une adresse ou d'une référence qui valent la peine d'être cherchés un par un.
  // Les petits mots courants (« rue », « de », « chemin »…) ne sont pas cherchés seuls : ils sont partout.
  var COURANTS = ("rue route avenue av chemin ch boulevard bd place pl allee impasse quai sentier strasse str weg gasse platz " +
    "de du des la le les et en au aux sur sous chez case postale numero no nr ref reference monsieur madame mme").split(" ");
  K.motsACherche = function (valeur) {
    return String(valeur).split(/[\s,;\/-]+/).filter(function (m) {
      var s = simplifier(m);
      return s.length >= 3 && COURANTS.indexOf(s) < 0 && !/^[0-9oisbz]{1,3}$/.test(s);
    });
  };
  K.exemplesRessemblance = {
    trouve: [["AKO270MXN", "AKQ278MXN"], ["DUP0NT", "Dupont"], ["Montfalcon,", "MONTFALCON"], ["Léman", "leman"], ["Martln", "Martin"]],
    ignore: [["Dupond", "Dupuis"], ["Paul", "Pail"], ["rue", "rue"], ["Marc", "Mars"], ["Lausanne", "Lucerne"]],
  };
})(typeof window !== "undefined" ? window : globalThis);
