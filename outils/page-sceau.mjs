#!/usr/bin/env node
/*
 * Kerckhoffs — fabriquer la page du sceau en un seul fichier.
 *
 *   node outils/page-sceau.mjs
 *
 * Recopie dans outils/sceau.html, en clair, les deux bibliothèques qu'elle utilise (vendor/),
 * et produit outils/sceau-autonome.html : un seul fichier, à ouvrir d'un double-clic, sans internet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let html = fs.readFileSync(path.join(racine, "outils/sceau.html"), "utf8");
html = html.replace(/<script src="\.\.\/(vendor\/[^"]+)"><\/script>/g, (m, f) => {
  const t = fs.readFileSync(path.join(racine, f), "utf8");
  if (/<\/script|<!--/i.test(t)) throw new Error(`${f} ne peut pas être recopié tel quel`);
  return `<script>\n/* ---- ${f} ---- */\n${t}\n</script>`;
});
if (/<script src=/.test(html.replace(/(<script[^>]*>)[\s\S]*?<\/script>/g, "$1</script>"))) throw new Error("Une référence externe est restée");
fs.writeFileSync(path.join(racine, "outils/sceau-autonome.html"), html);
console.log(`outils/sceau-autonome.html : ${(html.length / 1024).toFixed(0)} Ko`);
