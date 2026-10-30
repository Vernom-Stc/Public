/*
 * Kerckhoffs — Cerbère, le gardien à trois têtes.
 *
 * Avant d'envoyer, Cerbère relit ce qui reste VISIBLE et signale ce qui pourrait encore trahir quelqu'un.
 * Il ne masque rien tout seul : il propose, l'utilisateur décide. Tout se passe sur l'appareil.
 *
 *   regles    : formes à signaler (format : voir rules/registre.js, avec des exemples testés)
 *   sensibles : mots qui révèlent une situation personnelle. { mot, exact } :
 *               exact = true -> respecter les majuscules (« AI » oui, « ai » du verbe avoir non)
 *               sante = true -> une information de santé : avec un code postal, un âge ou le sexe, elle peut identifier quelqu'un
 *
 * Chacun peut compléter ces listes dans sa propre copie.
 */
Kerckhoffs.ajouterCerbere({
  regles: [
    {
      id: "nom-titre",
      label: "Nom probable après une civilité",
      type: "NOM",
      re: /\b(?:Monsieur|Madame|Mademoiselle|Mme|Mlle|M\.|Dr|Dre|Docteur|Docteure|Maître|Me|Prof\.|Herr|Frau|Mr|Mrs|Ms)\.?\s+(?:[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]+\s?){1,3}/g,
      exemples: {
        trouve: ["Monsieur JEAN EXEMPLE", "Madame Marie Exemple", "Dr Paul Exemple"],
        ignore: ["Monsieur,", "Madame, Monsieur,"]
      }
    },
    {
      id: "nom-majuscules",
      label: "Nom possible écrit en majuscules",
      type: "NOM",
      re: /\b[A-ZÀ-ÖØ-Ý]{3,}(?:[- ][A-ZÀ-ÖØ-Ý]{3,}){1,2}\b/g,
      exemples: { trouve: ["JEAN EXEMPLE"], ignore: ["CH-1211", "Jean Exemple"] }
    }
,
    {
      // Prénoms courants (français, allemand, italien, espagnol, portugais, anglais), écrits « Marie » ou « MARIE ».
      // Jamais masqués d'office (« rue Victor Hugo ») : seulement proposés dans la liste de contrôle.
      id: "prenom",
      label: "Prénom possible",
      type: "NOM",
      re: /(?<![A-Za-zÀ-ÖØ-öø-ÿ])(?:Alessandra|Alessandro|Christophe|Maximilian|Alejandro|Alexandre|Catherine|Christine|Elizabeth|Francesca|Francesco|Katharina|Sébastien|Véronique|Caroline|Fernando|Frédéric|Giovanni|Giuseppe|Isabelle|Jennifer|Nathalie|Patricia|Philippe|Sandrine|Stefanie|Stéphane|Andreas|Antoine|Antonio|Aurélie|Beatriz|Camille|Charles|Claudia|Florian|Gabriel|Jacques|Jessica|Laurent|Lorenzo|Mariana|Martina|Mathieu|Michael|Nicolas|Olivier|Patrick|Raphaël|Richard|Roberto|Stefano|Valérie|Vincent|William|Andrea|Arthur|Audrey|Carlos|Carmen|Chiara|Claire|Céline|Daniel|Edward|George|Giulia|Hannah|Isabel|Javier|Joseph|Julien|Jürgen|Louise|Manuel|Markus|Martin|Matteo|Maxime|Michel|Miguel|Monika|Nathan|Olivia|Pascal|Pierre|Robert|Sabine|Sergio|Sophie|Stefan|Steven|Sylvie|Teresa|Thomas|Tobias|Ursula|Élodie|Émilie|Alain|Alice|Brian|Chloé|David|Diego|Elena|Emily|Felix|Henry|James|Jonas|Jules|Julia|Julie|Karen|Kevin|Klaus|Laura|Linda|Louis|Lucas|Lucie|Lucía|Luigi|Lukas|Manon|Marco|Maria|Marie|Mario|Nancy|Pablo|Paola|Pedro|Peter|Petra|Pilar|Sarah|Sofía|Susan|Adam|Anna|Anne|Emma|Enzo|Eric|Hans|Hugo|Inès|Inês|Jade|Jean|John|José|João|Juan|Lena|Lina|Lisa|Luca|Luis|Marc|Mark|Mary|Noah|Paul|Rosa|Ryan|Sara|Théo|Éric|Ana|Léa|Léo|Rui|Zoé|ALESSANDRA|ALESSANDRO|CHRISTOPHE|MAXIMILIAN|ALEJANDRO|ALEXANDRE|CATHERINE|CHRISTINE|ELIZABETH|FRANCESCA|FRANCESCO|KATHARINA|SÉBASTIEN|VÉRONIQUE|CAROLINE|FERNANDO|FRÉDÉRIC|GIOVANNI|GIUSEPPE|ISABELLE|JENNIFER|NATHALIE|PATRICIA|PHILIPPE|SANDRINE|STEFANIE|STÉPHANE|ANDREAS|ANTOINE|ANTONIO|AURÉLIE|BEATRIZ|CAMILLE|CHARLES|CLAUDIA|FLORIAN|GABRIEL|JACQUES|JESSICA|LAURENT|LORENZO|MARIANA|MARTINA|MATHIEU|MICHAEL|NICOLAS|OLIVIER|PATRICK|RAPHAËL|RICHARD|ROBERTO|STEFANO|VALÉRIE|VINCENT|WILLIAM|ANDREA|ARTHUR|AUDREY|CARLOS|CARMEN|CHIARA|CLAIRE|CÉLINE|DANIEL|EDWARD|GEORGE|GIULIA|HANNAH|ISABEL|JAVIER|JOSEPH|JULIEN|JÜRGEN|LOUISE|MANUEL|MARKUS|MARTIN|MATTEO|MAXIME|MICHEL|MIGUEL|MONIKA|NATHAN|OLIVIA|PASCAL|PIERRE|ROBERT|SABINE|SERGIO|SOPHIE|STEFAN|STEVEN|SYLVIE|TERESA|THOMAS|TOBIAS|URSULA|ÉLODIE|ÉMILIE|ALAIN|ALICE|BRIAN|CHLOÉ|DAVID|DIEGO|ELENA|EMILY|FELIX|HENRY|JAMES|JONAS|JULES|JULIA|JULIE|KAREN|KEVIN|KLAUS|LAURA|LINDA|LOUIS|LUCAS|LUCIE|LUCÍA|LUIGI|LUKAS|MANON|MARCO|MARIA|MARIE|MARIO|NANCY|PABLO|PAOLA|PEDRO|PETER|PETRA|PILAR|SARAH|SOFÍA|SUSAN|ADAM|ANNA|ANNE|EMMA|ENZO|ERIC|HANS|HUGO|INÈS|INÊS|JADE|JEAN|JOHN|JOSÉ|JOÃO|JUAN|LENA|LINA|LISA|LUCA|LUIS|MARC|MARK|MARY|NOAH|PAUL|ROSA|RYAN|SARA|THÉO|ÉRIC|ANA|LÉA|LÉO|RUI|ZOÉ)(?![A-Za-zÀ-ÖØ-öø-ÿ])/g,
      exemples: { trouve: ["HUGO", "Marie", "Jürgen"], ignore: ["hugo", "Mariette", "Annecy", "PAULINE"] }
    },
    {
      // Code de référence mêlant lettres et chiffres (numéro de document, de dossier…), ex. « AKQ278MXN »
      id: "reference",
      label: "Référence possible (lettres et chiffres)",
      type: "REFERENCE",
      re: /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{7,14}\b/g,
      exemples: { trouve: ["AKQ278MXN"], ignore: ["ICC", "2023", "MONTFALCON"] }
    }
  ],
  sensibles: [
    { mot: "AI", exact: true, sante: true }, { mot: "invalidité", sante: true }, { mot: "maladie", sante: true }, { mot: "malade", sante: true },
    { mot: "diagnostic", sante: true }, { mot: "traitement", sante: true }, { mot: "médicament", sante: true }, { mot: "hospitalisation", sante: true },
    { mot: "hôpital", sante: true }, { mot: "psychiatre", sante: true }, { mot: "psychiatrique", sante: true }, { mot: "thérapie", sante: true },
    { mot: "handicap", sante: true }, { mot: "grossesse", sante: true }, { mot: "accident", sante: true }, { mot: "incapacité", sante: true },
    { mot: "salaire" }, { mot: "revenu" }, { mot: "dette" }, { mot: "dettes" }, { mot: "poursuite" },
    { mot: "poursuites" }, { mot: "faillite" }, { mot: "chômage" }, { mot: "licenciement" },
    { mot: "aide sociale" }, { mot: "casier" }, { mot: "condamnation" }, { mot: "plainte" },
    { mot: "divorce" }, { mot: "séparation" }, { mot: "religion" }, { mot: "syndicat" }
  ]
});

/*
 * La forme d'un nom, dans n'importe quelle langue : un NOM en majuscules à côté d'un Prénom.
 *  - avec un prénom courant (« Jean EXEMPLE », « EXEMPLE Jean ») : masqué d'office ;
 *  - avec un autre mot à majuscule (« Testeuse DUPONT ») : seulement signalé avant l'envoi.
 * Les sigles et mots de gestion (SA, AG, CHF, TVA…) ne comptent pas comme des noms.
 */
(function (K) {
  var regle = K.cerbere.regles.filter(function (r) { return r.id === "prenom"; })[0];
  var m = regle && regle.re.source.match(/\(\?:(.*)\)\(\?!/);
  if (!m) return;
  var P = "(?:" + m[1] + ")", L = "(?<![A-Za-zÀ-ÖØ-öø-ÿ])", R = "(?![A-Za-zÀ-ÖØ-öø-ÿ])";
  var NOM = "[A-ZÀ-ÖØ-Ý]{2,}(?:[-' ][A-ZÀ-ÖØ-Ý]{2,})?";
  var SIGLES = /^(SA|AG|SARL|GMBH|LTD|INC|CHF|EUR|USD|TVA|MWST|IVA|AVS|AHV|AI|IV|LPP|BVG|LAMAL|KVG|PDF|CEO|CH|UE|EU|OK|NB|PS)$/;
  var pasSigle = function (v) { return !v.split(/[\s'-]+/).some(function (w) { return SIGLES.test(w) || /^[A-ZÀ-ÖØ-Ý]{2,}$/.test(w) && w.length <= 3 && !new RegExp("^" + P + "$").test(w); }); };
  K.ajouterCommun([{
    id: "prenom-nom",
    label: "Prénom et NOM",
    type: "PERSONNE",
    re: new RegExp(L + "(?:" + P + "(?:[- ]" + P + ")?\\s+" + NOM + "|" + NOM + "\\s+" + P + "(?:[- ]" + P + ")?)" + R, "g"),
    check: pasSigle,
    silent: true,
    exemples: { trouve: ["Jean EXEMPLE", "EXEMPLE Jean", "Marie-Claire DUPONT", "MUSTER Anna"], ignore: ["Total CHF", "Jean SA", "Votre DOSSIER"] }
  }]);
  K.cerbere.regles.push({
    id: "nom-forme",
    label: "Nom possible (NOM en majuscules et Prénom)",
    type: "NOM",
    re: new RegExp(L + "(?:[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’-]{2,}\\s+" + NOM + "|" + NOM + "\\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ'’-]{2,})" + R, "g"),
    check: function (v) { return pasSigle(v) && !v.split(/\s+/).some(function (w) { return /^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]/.test(w) && K.estCourant(w); }); },
    silent: true,
    exemples: { trouve: ["Testeuse DUPONT", "DUPONT Testeuse"], ignore: ["Total CHF", "Votre AVS", "Votre DOSSIER"] }
  });
})(Kerckhoffs);
