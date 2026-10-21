/*
 * Kerckhoffs — règles valables dans tous les pays.
 * Format : voir rules/registre.js.
 */
Kerckhoffs.ajouterCommun([
  {
    id: "email",
    label: "Adresses e-mail",
    type: "EMAIL",
    re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
    exemples: { trouve: ["jean.exemple@example.ch"], ignore: ["Rue du Lac 12"] }
  },
  {
    id: "longnum",
    label: "Longs numéros (8 chiffres ou plus)",
    type: "NUMERO",
    re: /\b\d{8,}\b/g,
    exemples: { trouve: ["48291736"], ignore: ["1234567"] }
  }
]);
