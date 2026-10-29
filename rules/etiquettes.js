/*
 * Kerckhoffs — étiquettes de formulaire.
 *
 * Dans les documents médicaux, administratifs ou juridiques, une donnée personnelle suit souvent une étiquette :
 * « Nom : », « Né le », « Patient : », « N° d'assuré : »… Kerckhoffs masque ce qui suit, et Cerbère vérifie.
 *
 *   type           préfixe du jeton : "PERSONNE" donne [PERSONNE_1]
 *   mots           les étiquettes, sans tenir compte des majuscules ni des accents
 *   sansDeuxPoints true si l'étiquette n'est pas forcément suivie de « : » (ex. « Né le 12.03.1980 »)
 *   valeurNom      true : ne garder que les mots qui commencent par une majuscule juste après l'étiquette (4 au plus)
 *   exemples       { trouve: [[texte, valeur attendue], ...], ignore: [...] } — vérifiés par rules/tester.js
 *
 * Uniquement des données : chacun peut compléter cette liste pour son métier ou sa langue.
 */
Kerckhoffs.ajouterEtiquettes([
  {
    id: "nom",
    type: "PERSONNE",
    mots: ["nom", "prénom", "nom de famille", "nom et prénom", "patient", "patiente", "assuré", "assurée",
           "client", "cliente", "requérant", "requérante", "représentant légal", "conjoint", "conjointe",
           "personne assurée", "personne assurée", "assuré(e)", "preneur d'assurance", "preneuse d'assurance", "titulaire de la police",
           "versicherte person", "versicherter", "versicherte", "versicherungsnehmer", "versicherungsnehmerin",
           "persona assicurata", "assicurato", "assicurata", "contraente",
           "name", "vorname", "first name", "last name", "nachname", "surname", "full name", "nom complet",
           "owner", "holder", "applicant", "titulaire", "demandeur", "demanderesse", "inhaber", "inhaberin", "anmelder", "anmelderin"],
    exemples: { trouve: [["Nom : Exemple", "Exemple"], ["Patient : Jean Exemple", "Jean Exemple"], ["Nom : Exemple Prénom : Jean", "Exemple"],
                         ["Personne assurée, année de naissance: Léa Exemple, 2009", "Léa Exemple"]], ignore: ["Nombre : 3", "le nom de la rue"] }
  },
  {
    // Registres et formulaires sans « : » (« Owner HUGO EXEMPLE (Mexico) », « Inhaber Max Muster »).
    // Sans deux-points, on ne garde que les mots qui commencent par une majuscule, juste après l'étiquette.
    id: "titulaire",
    type: "PERSONNE",
    mots: ["owner", "holder", "applicant", "titulaire", "demandeur", "demanderesse", "inhaber", "inhaberin", "anmelder", "anmelderin"],
    sansDeuxPoints: true,
    valeurNom: true,
    exemples: { trouve: [["Owner HUGO EXEMPLE (Mexico)", "HUGO EXEMPLE"], ["Inhaber Max Muster", "Max Muster"]],
                ignore: ["the owner of the house", "titulaire du compte", "Owner (Mexico)"] }
  },
  {
    id: "naissance",
    type: "NAISSANCE",
    mots: ["né le", "née le", "né(e) le", "date de naissance", "année de naissance", "ddn", "geburtsdatum", "jahrgang", "geburtsjahr",
           "anno di nascita", "data di nascita", "date of birth", "year of birth", "dob"],
    sansDeuxPoints: true,
    exemples: { trouve: [["Né le 12.03.1980", "12.03.1980"], ["Date de naissance : 1er mars 1980", "1er mars 1980"],
                         ["Personne assurée, année de naissance: Léa Exemple, 2009", "2009"]], ignore: ["il ne le sait pas"] }
  },
  {
    id: "adresse",
    type: "ADRESSE",
    mots: ["adresse", "domicile", "domicilié", "domiciliée", "adresse e-mail", "courriel", "anschrift", "wohnort", "address"],
    exemples: { trouve: [["Domicile : Rue du Lac 12", "Rue du Lac 12"]], ignore: ["à l'adresse suivante"] }
  },
  {
    id: "numero",
    type: "NUMERO",
    mots: ["ref-nr", "ref.-nr.", "no de police", "n° de police", "numéro de police", "police n°", "police no", "no police",
           "policennummer", "police-nr.", "police-nr", "numero di polizza", "polizza n.", "no client", "numéro de client", "n° client",
           "kundennummer", "kunden-nr.", "numero cliente", "no d'assuré", "n° d'assuré", "numéro d'assuré", "n° avs", "n° de dossier", "no de dossier", "n° patient",
           "numéro de patient", "n° de police", "n° client", "n° de contribuable", "versichertennummer"],
    exemples: { trouve: [["N° de dossier : 2026-4471", "2026-4471"], ["No de police: 1234567", "1234567"], ["Policennummer: 99.123.456", "99.123.456"]], ignore: [] }
  },
  {
    id: "contact",
    type: "TEL",
    mots: ["téléphone", "tél", "tel", "natel", "mobile", "portable", "telefon", "phone"],
    exemples: { trouve: [["Tél. : 021 555 12 34", "021 555 12 34"]], ignore: ["par téléphone"] }
  },
  {
    id: "medecin",
    type: "PERSONNE",
    mots: ["médecin traitant", "médecin", "dr méd.", "thérapeute", "avocat", "notaire", "conseiller", "conseillère"],
    exemples: { trouve: [["Médecin traitant : Dr Paul Exemple", "Dr Paul Exemple"]], ignore: ["le médecin a dit"] }
  }
]);

/*
 * Vocabulaire des formulaires officiels : étiquettes écrites AU-DESSUS de la valeur.
 *
 * Dans beaucoup de formulaires (actes d'état civil, demandes de visa, formulaires CIEC), l'étiquette est sur sa
 * propre ligne, parfois empilée en plusieurs langues, et la valeur est écrite dessous, dans la même colonne.
 * Une ligne faite uniquement de ces étiquettes est reconnue comme une étiquette ; la ligne juste dessous est masquée.
 * Relevé dans des formulaires publics suisses (bj.admin.ch, sem.admin.ch, ar.admin.ch) : de, fr, it, rm, en.
 * Les titres de section (« Parents », « Enfant »…) n'y sont volontairement pas : ce ne sont pas des étiquettes de valeur.
 */
Kerckhoffs.ajouterVocabulaire({
  PERSONNE: [
    "name", "vorname", "vornamen", "nachname", "familienname", "ledigname", "geburtsname", "andere amtliche namen",
    "name zum zeitpunkt der ausstellung des auszugs", "name vor der eheschliessung", "sonstiger namensbestandteil", "sonstige namensbestandteile",
    "nom", "noms", "prenom", "prenoms", "prenom(s)", "nom de famille", "nom de celibataire", "nom de naissance", "autres noms",
    "nom avant le mariage", "nom au moment de la delivrance de l'acte", "autre partie du nom", "autres parties du nom", "nom et prenom",
    "cognome", "nome", "nomi", "cognome da nubile/celibe", "cognome da nubile", "celibe", "cognome alla nascita", "altri nomi ufficiali",
    "cognome prima del matrimonio", "cognome al momento del rilascio dell'estratto", "altra parte del cognome", "altre parti del cognome",
    "nom et prenom", "nom et prenoms", "nom, prenom", "surname and first name", "surname, first name", "cognome e nome", "cognome, nome",
    "name und vorname", "name, vorname", "num e prenum",
    "surname", "family name", "first name", "first names", "given name", "given names", "surname at birth", "former family name",
    "former family names", "full name",
    "num", "prenums", "num da nubil", "num da nubila resp. nubil", "auters nums uffizials", "num avant la maridaglia",
    "auter element dal num", "auters elements dal num",
    "zivilstandsbeamtin", "zivilstandsbeamter", "zivilstandsbeamtin/zivilstandsbeamter", "nom de l'officier de l'etat civil",
    "cognome dell'ufficiale dello stato civile", "num da la funcziunaria", "num dal funcziunari da stadi civil", "funcziunari da stadi civil", "unterschrift", "signature", "firma", "suttascripziun"
  ],
  NAISSANCE: [
    "geburtsdatum", "geburtszeit", "date de naissance", "heure de naissance", "data di nascita", "ora di nascita",
    "date of birth", "data da naschientscha", "uras da la naschientscha"
  ],
  LIEU: [
    "geburtsort", "lieu de naissance", "luogo di nascita", "place of birth", "lieu da naschientscha", "heimatort", "heimatorte",
    "lieu d'origine", "luogo di attinenza", "ort der eheschliessung", "lieu du mariage", "luogo del matrimonio", "lieu da la maridaglia"
  ],
  DATE: [
    "datum", "date", "data", "datum der eheschliessung", "date du mariage", "data del matrimonio", "data da la maridaglia", "date de delivrance",
    "datum der ausstellung", "data di rilascio", "data da la emissiun"
  ],
  ADRESSE: [
    "adresse", "wohnadresse", "zustelladresse", "rechnungsadresse", "adresse du domicile", "adresse et localite", "indirizzo",
    "indirizzo del domicilio", "home address", "address", "domicile", "wohnort"
  ],
  NUMERO: [
    "ref-nr", "nr. des eintrags", "nr. des auszugs", "n° de l'acte", "n° de l'extrait", "n. dell'atto", "n. dell'estratto",
    "nr. da l'inscripziun", "nr. da l'extract", "numero personnel d'identification", "personenkennzeichen", "numero personale d'identificazione",
    "identificatur persunal", "no avs", "ahv-nr", "n. avs", "national identity number", "numero national d'identite",
    "numero di identita nazionale", "number of travel document", "numero du document de voyage", "numero del documento di viaggio",
    "nummer des reisedokuments", "passnummer", "number of travel docu", "numero du document de voyage"
  ],
  // Autres données personnelles des formulaires (sexe, état civil, nationalité) : la valeur est masquée.
  DONNEE: [
    "sexe", "geschlecht", "sesso", "schlattaina", "sex", "etat civil", "zivilstand", "stato civile", "civil status",
    "nationalite", "nationalites", "nationalite(s)", "staatsangehorigkeit", "nazionalita", "nationality", "current nationality",
    "avez-vous des enfants ?", "avez-vous des enfants", "profession", "beruf", "professione", "occupation", "current occupation"
  ],
  TEL: ["telefon", "telefonnummer", "telephone", "numero de telephone", "no de telephone", "numero di telefono", "telephone no", "natel"],
  EMAIL: ["e-mail", "e-mail-adresse", "email", "adresse email", "adresse electronique", "indirizzo di posta elettronica", "e-mail address"]
});
