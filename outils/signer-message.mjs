#!/usr/bin/env node
/*
 * Kerckhoffs — signer un message de l'auteur.  /  Sign an author message.
 *
 *   node outils/signer-message.mjs /chemin/vers/cle-privee.pem message.txt
 *
 * Affiche le message signé, prêt à publier. N'importe qui peut le vérifier dans l'application
 * (« Vérifier ma version » → « Vérifier un message de l'auteur »), sans internet.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const [cle, fichier] = process.argv.slice(2);
if (!cle || !fichier) { console.log("Usage : node outils/signer-message.mjs /chemin/vers/cle-privee.pem message.txt"); process.exit(1); }
const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// Le même nettoyage que verification.js : retours à la ligne, espaces en début et en fin de ligne, lignes vides au début et à la fin.
const nettoyer = (t) => String(t).normalize("NFC").replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/^[ \t\u00a0]+|[ \t\u00a0]+$/g, "")).join("\n").replace(/^\n+|\n+$/g, "");
const prive = crypto.createPrivateKey(fs.readFileSync(cle));
if (crypto.createPublicKey(prive).export({ type: "spki", format: "pem" }).trim() !== fs.readFileSync(path.join(racine, "cle-publique.pem"), "utf8").trim()) {
  console.log("✗ Cette clé privée ne correspond pas à cle-publique.pem. Rien n'a été signé."); process.exit(1);
}
const texte = nettoyer(fs.readFileSync(fichier, "utf8"));
if (/-----/.test(texte)) { console.log("✗ Le message ne doit pas contenir « ----- »."); process.exit(1); }
const sig = crypto.sign(null, Buffer.from(texte, "utf8"), prive).toString("base64");
console.log(`-----DÉBUT MESSAGE KERCKHOFFS-----\n${texte}\n-----SIGNATURE-----\n${sig}\n-----FIN-----`);
