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
      // Une étiquette n'avale jamais une autre étiquette ni une indication de format (« | Heure de naissance », « (jour-mois-année) »).
      if (/^[|(\/;\[]/.test(valeur) || (K.ligneEtiquette && K.ligneEtiquette(valeur))) valeur = "";
      if (t.etiquette.valeurNom) {
        var nom = valeur.match(/^(?:[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+(?:\s+|$)){1,4}/);
        valeur = nom ? nom[0].trim() : "";
      }
      return { etiquette: t.etiquette, debut: t.debut, fin: t.debut + valeur.length, valeur: valeur };
    }).filter(function (v) { return /[A-Za-zÀ-ÿ0-9]/.test(v.valeur); });
  };
  /* ---- Étiquettes au-dessus de la valeur (voir rules/etiquettes.js : ajouterVocabulaire) ---- */
  K.vocabulaire = K.vocabulaire || [];
  var LIAISON = {};
  ("de du des la le les l d di del della dello dei da dal dals of the and und et e ed ou oder o resp a au alla zum zur der den dem al il in " +
   "en if applicable where le cas echeant falls zutreffend se del caso jour mois annee tag monat jahr day month year giorno mese anno " +
   "jj mm aaaa tt jjjj gg an usuel usuels anterieur anterieurs demandeur demanderesse applicant applicants cas echeant ment " +
   "l'inscripziun l'extract dell'atto dell'estratto l'acte l'extrait").split(" ").forEach(function (m) { LIAISON[m] = true; });
  K.ajouterVocabulaire = function (parType) {
    Object.keys(parType).forEach(function (type) {
      parType[type].forEach(function (phrase) { K.vocabulaire.push({ type: type, mots: sansAccent(phrase).split(/[\s]+/).filter(Boolean) }); });
    });
    K.vocabulaire.sort(function (a, b) { return b.mots.length - a.mots.length; });
  };
  var motsLigne = function (t) {
    return sansAccent(t).replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\([^)]*$|^[^(]*?\)/g, " ").replace(/[()]/g, " ").replace(/-(\s|$)/g, "$1").replace(/[☐□*:;,"“”«»]/g, " ").replace(/(^|\s)[\d.\-]+(?=\s|$)/g, " ")
      .split(/[\s\/]+/).map(function (m) { return m.replace(/^[^a-z0-9°]+|[^a-z0-9°.)]+$/g, ""); }).filter(Boolean);
  };
  // Erreur de lecture tolérée sur les longs mots d'étiquette (« naschientsche » pour « naschientscha ») : une lettre au plus.
  function motProche(lu, attendu) {
    if (lu === attendu) return true;
    if (attendu.length < 7 || Math.abs(lu.length - attendu.length) > 1) return false;
    var a = lu, b = attendu, i = 0, j = 0, diff = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return diff + (a.length - i) + (b.length - j) <= 1;
  }
  // Une partie de ligne (entre deux « | ») faite seulement d'étiquettes : renvoie le type de la première, sinon null.
  function partieEtiquette(texte) {
    var mots = motsLigne(texte); if (!mots.length) return null;
    var type = null, reste = 0, i = 0;
    while (i < mots.length) {
      var trouve = null;
      for (var k = 0; k < K.vocabulaire.length && !trouve; k++) {
        var v = K.vocabulaire[k], ok = v.mots.length && i + v.mots.length <= mots.length;
        for (var j = 0; ok && j < v.mots.length; j++) if (!motProche(mots[i + j], v.mots[j])) ok = false;
        if (ok) trouve = v;
      }
      if (trouve) { if (!type) type = trouve.type; i += trouve.mots.length; }
      else { if (!LIAISON[mots[i]]) reste++; i++; }
    }
    return type && reste === 0 ? type : null;
  }
  // Un mot qui fait partie du vocabulaire des étiquettes (« Prénoms », « Cognome ») : jamais appris comme un nom.
  // Une ligne sans aucun mot (formats « [JJ/MM/AAAA] », traits, cases) : ni étiquette, ni valeur.
  K.ligneVide = function (t) { return motsLigne(t).length === 0; };
  K.estMotEtiquette = function (mot) {
    var m = motsLigne(mot)[0]; if (!m) return false;
    return K.vocabulaire.some(function (v) { return v.mots.indexOf(m) >= 0 && v.mots.length <= 3; });
  };
  // Une ligne faite seulement d'étiquettes (« Name | Vornamen », « Nom / Name / Cognome / Num ») : les types, partie par partie.
  K.ligneEtiquette = function (texte) {
    var parties = String(texte).split("|");
    var types = parties.map(partieEtiquette);
    return types.every(function (t) { return !!t; }) ? types : null;
  };
  K.exemplesLigneEtiquette = {
    oui: ["Data da naschientsche", "Name", "Nom de célibataire | Autres noms", "7 Nom / Name / Cognome / Num", "Geburtsdatum | Geburtszeit", "1. Surname (Family name) / Nom (nom de famille)",
          "Data da naschientscha | Uras da la naschientscha", "Date of birth (day-month-year) / Date de naissance (jour-mois-année)"],
    non: ["EXEMPLE", "EXEMPLE | Jean", "Exempleville", "Kind - Enfant - Figlio/a - Uffant", "01.01.2020 | 10:15", "Léa Marie", "Office de l'état civil d'Exempleville"]
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
  /* ---- Reconnaître un identifiant à sa forme, dans n'importe quel pays ----
   * On ne connaît pas les documents de chaque pays. Mais un numéro de dossier, de patient ou de contribuable
   * a une forme reconnaissable : assez long, plusieurs chiffres, des lettres et des chiffres mêlés, des séparateurs répétés.
   * Chaque signal rapporte des points :
   *   lettres ET chiffres mêlés : 2   ·   au moins trois blocs (lettres / chiffres / séparés) : 1
   *   deux séparateurs ou plus : 1     ·   8 caractères utiles ou plus : 1   ·   12 ou plus : 1
   * 4 points ou plus : masqué d'office.  2 ou 3 points : signalé « à vérifier » avant l'envoi.
   * Jamais : les dates, les montants, les heures, les années seules, les numéros de version.
   */
  var DATE_SIMPLE = /^(?:\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})$/;
  var MONTANT = /^\d{1,3}(?:['’ ]\d{3})*(?:[.,]\d{1,2})?$|^\d+[.,]\d{2}$/;
  K.formeIdentifiant = function (texte) {
    var t = String(texte).trim().replace(/[,;:)]+$/, "").replace(/^[(]+/, "");
    if (DATE_SIMPLE.test(t) || MONTANT.test(t)) return 0;
    var utile = t.replace(/[\s.\-\/_]/g, "");
    if (!/^[A-Za-z0-9]+$/.test(utile) || utile.length < 6) return 0;
    var chiffres = (utile.match(/\d/g) || []).length, lettres = utile.length - chiffres;
    if (chiffres < 3) return 0;
    var seps = (t.match(/[\s.\-\/_]/g) || []).length;
    var blocs = t.split(/[\s.\-\/_]+/).reduce(function (n, b) { return n + (b.match(/[A-Za-z]+|\d+/g) || []).length; }, 0);
    var points = 0;
    if (lettres > 0) points += 2;
    if (blocs >= 3) points += 1;
    if (seps >= 2) points += 1;
    if (utile.length >= 8) points += 1;
    if (utile.length >= 12) points += 1;
    return points >= 4 ? 2 : points >= 2 ? 1 : 0;
  };
  // Cherche dans une ligne les candidats : un mot fait de lettres, chiffres et séparateurs,
  // ou des groupes de chiffres séparés par des espaces (« 1234 5678 9012 »). Renvoie [{ debut, fin, valeur, niveau }].
  K.candidatsIdentifiant = function (ligne) {
    var out = [], pris = [];
    var essayer = function (re) {
      re.lastIndex = 0; var m;
      while ((m = re.exec(ligne))) {
        var v = m[0].replace(/[.,;:\-\/]+$/, ""), d = m.index, f = d + v.length;
        if (pris.some(function (p) { return p[0] < f && p[1] > d; })) continue;
        var n = K.formeIdentifiant(v);
        if (n) { out.push({ debut: d, fin: f, valeur: v, niveau: n }); pris.push([d, f]); }
      }
    };
    essayer(/(?<![\w.,'’@])\d{2,6}(?: \d{2,6}){2,5}(?![\w'’@]|[.,]\d)/g);
    essayer(/(?<![\w@.'’-])[A-Za-z0-9](?:[A-Za-z0-9]|[.\-\/_](?=[A-Za-z0-9]))+(?![\w@'’-])/g);
    return out;
  };
  K.exemplesIdentifiant = {
    masque: ["MAT-2024-0012", "ABCDE1234F", "1234 5678 9012", "AKO270MXN", "BE-2019-00042-X"],
    aVerifier: ["X7K2P9", "SR-48213"],
    ignore: ["12.03.2024", "1'500.00", "412.30", "2026", "Lausanne", "covid19", "0.6.2", "2026-2027", "H2O", "18:26:36", "jean.exemple"],
  };

  /* ---- Les mots courants du français : jamais cherchés « à peu près » ----
   * « Tous les pareils » tolère les erreurs de lecture. Mais un mot courant (« attente », « plutôt », « locataires »)
   * ne doit être trouvé que s'il est écrit exactement pareil, et une zone faite seulement de mots courants
   * est proposée décochée : ce sont des mots ordinaires, pas des données privées.
   * La liste est volontairement courte et peut être complétée, langue par langue. */
  var COURANTS_FR = ("a ai as au aux avec avez avons ce ces cet cette ceux chez comme dans de des du elle elles en entre est et été être " +
    "il ils je la le les leur leurs lui ma mais me mes moi mon ne nos notre nous on ou où par pas pour qu que qui sa sans se ses si son " +
    "sont sur ta te tes toi ton tous tout toute toutes tu un une vos votre vous " +
    "afin ainsi alors après assez aucun aussi autre autres avant bien bon bonne car cela celle celui chaque ci contre déjà depuis donc " +
    "dont encore ensuite faire fait fois hors ici jamais jusqu là lors lorsque même mêmes moins non peu peut plus plusieurs plutôt " +
    "pourquoi pourtant près puis quand quel quelle quelque quelques rien selon seul seule seulement sous souvent suite tant toujours très " +
    "trop vers voici voilà oui " +
    "madame monsieur mesdames messieurs mademoiselle cher chère chers chères salutations sentiments distingués distinguées assurance " +
    "attente réponse demande lettre courrier correspondance annexe annexes copie objet concerne référence références dossier dossiers " +
    "date dates jour jours mois année années semaine heure heures matin soir journée journées " +
    "adresse adresses téléphone tél fax mail email courriel site page pages nom noms prénom prénoms numéro numéros " +
    "association société entreprise office service services bureau direction administration commune canton ville rue route avenue " +
    "chemin place case postale locataire locataires bailleur bailleresse régie propriétaire propriétaires loyer loyers bail logement " +
    "contrat contrats facture factures montant total prix frais paiement compte banque " +
    "enseignant enseignants enseignante enseignantes formateur formatrice module modules cours thème session sessions " +
    "titulaire brevet diplôme formation patient patiente médecin docteur client cliente madame " +
    "comme convenu nos vos informés informé informée prions croire veuillez agréer recevoir trouverez tiendrons sera seront donnée donné").split(" ");
  var DICO_COURANT = {};
  COURANTS_FR.forEach(function (m) { DICO_COURANT[simplifier(m)] = true; });
  K.estCourant = function (mot) { var s = simplifier(mot); return !!s && DICO_COURANT[s] === true; };
  // Une zone faite seulement de mots courants : rien de privé, a priori.
  K.queDesMotsCourants = function (texte) {
    var mots = String(texte).split(/[\s,;:.'’()\/-]+/).filter(function (m) { return simplifier(m).length > 0; });
    return mots.length > 0 && mots.every(function (m) { return K.estCourant(m) || /^\d{1,2}$/.test(m); });
  };
  // Ressemblance prudente : un mot lu qui est un mot courant ne « ressemble » pas, il doit être identique.
  var ressembleLarge = K.ressemble;
  K.ressemble = function (motLu, motCherche) {
    if (K.estCourant(motLu)) return simplifier(motLu) === simplifier(motCherche);
    return ressembleLarge(motLu, motCherche);
  };

  K.exemplesRessemblance = {
    trouve: [["AKO270MXN", "AKQ278MXN"], ["DUP0NT", "Dupont"], ["Montfalcon,", "MONTFALCON"], ["Léman", "leman"], ["Martln", "Martin"]],
    ignore: [["Dupond", "Dupuis"], ["Paul", "Pail"], ["rue", "rue"], ["Marc", "Mars"], ["Lausanne", "Lucerne"], ["locataires", "Locataire"], ["attente", "attentes"]],
  };
})(typeof window !== "undefined" ? window : globalThis);
