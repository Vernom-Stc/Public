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
           "name", "vorname", "first name", "last name", "nachname", "surname", "full name", "nom complet",
           "owner", "holder", "applicant", "titulaire", "demandeur", "demanderesse", "inhaber", "inhaberin", "anmelder", "anmelderin"],
    exemples: { trouve: [["Nom : Exemple", "Exemple"], ["Patient : Jean Exemple", "Jean Exemple"], ["Nom : Exemple Prénom : Jean", "Exemple"]], ignore: ["Nombre : 3", "le nom de la rue"] }
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
    mots: ["né le", "née le", "né(e) le", "date de naissance", "ddn", "geburtsdatum", "date of birth", "dob"],
    sansDeuxPoints: true,
    exemples: { trouve: [["Né le 12.03.1980", "12.03.1980"], ["Date de naissance : 1er mars 1980", "1er mars 1980"]], ignore: ["il ne le sait pas"] }
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
    mots: ["n° d'assuré", "no d'assuré", "numéro d'assuré", "n° avs", "n° de dossier", "no de dossier", "n° patient",
           "numéro de patient", "n° de police", "n° client", "n° de contribuable", "versichertennummer"],
    exemples: { trouve: [["N° de dossier : 2026-4471", "2026-4471"]], ignore: [] }
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
