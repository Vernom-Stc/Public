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
