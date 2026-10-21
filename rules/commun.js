/*
 * Kerckhoffs — règles de détection communes à tous les pays.
 *
 * Chaque règle : { id, label, type, re, check? }
 *   id    : identifiant unique (sert aussi pour la case à cocher)
 *   label : texte affiché à l'utilisateur
 *   type  : préfixe du jeton, ex. EMAIL donne [EMAIL_1]
 *   re    : expression régulière, avec le drapeau g
 *   check : fonction facultative ; si elle renvoie false, la zone est signalée « à relire »
 *
 * Pour adapter Kerckhoffs à un autre pays, copiez rules/suisse.js et modifiez-le.
 */
window.KERCKHOFFS_RULES = window.KERCKHOFFS_RULES || [];

window.KERCKHOFFS_RULES.push(
  {
    id: "email",
    label: "Adresses e-mail",
    type: "EMAIL",
    re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
  },
  {
    id: "longnum",
    label: "Longs numéros (8 chiffres ou plus)",
    type: "NUMERO",
    re: /\b\d{8,}\b/g
  }
);
