#!/usr/bin/env node
/*
 * Kerckhoffs — signer une version.  /  Sign a release.
 *
 *   node outils/signer.mjs /chemin/vers/cle-privee.pem
 *
 * Écrit empreintes.txt et empreintes.sig à la racine. La clé privée ne doit JAMAIS être dans le dépôt :
 * gardez-la sur une clé USB ou un ordinateur hors ligne. Une seule personne la détient : l'auteur.
 * Créer la clé, une fois pour toutes :  openssl genpkey -algorithm ed25519 -out cle-privee.pem
 * puis la clé publique :                openssl pkey -in cle-privee.pem -pubout -out cle-publique.pem
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { texteEmpreintes, empreinteCourte, version, sha256 } from "./empreintes.mjs";

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cle = process.argv[2];
if (!cle) { console.log("Usage : node outils/signer.mjs /chemin/vers/cle-privee.pem"); process.exit(1); }
const prive = crypto.createPrivateKey(fs.readFileSync(cle));
const publique = crypto.createPublicKey(prive).export({ type: "spki", format: "pem" });
if (publique.trim() !== fs.readFileSync(path.join(racine, "cle-publique.pem"), "utf8").trim()) {
  console.log("✗ Cette clé privée ne correspond pas à cle-publique.pem. Rien n'a été signé."); process.exit(1);
}
const texte = texteEmpreintes(racine);
fs.writeFileSync(path.join(racine, "empreintes.txt"), texte);
fs.writeFileSync(path.join(racine, "empreintes.sig"), crypto.sign(null, Buffer.from(texte, "utf8"), prive));
const v = version(racine);
console.log(`Version ${v} signée. Empreinte : ${empreinteCourte(texte)}`);

// La version figée (un seul fichier), si elle a été fabriquée : node outils/fichier-fige.mjs
const fige = `telecharger/kerckhoffs-${v}.html`;
let sommeFige = "—";
if (fs.existsSync(path.join(racine, fige))) {
  const contenu = fs.readFileSync(path.join(racine, fige));
  fs.writeFileSync(path.join(racine, fige + ".sig"), crypto.sign(null, contenu, prive));
  sommeFige = "`" + sha256(contenu) + "`";
  console.log(`${fige} signé. SHA-256 : ${sha256(contenu)}`);
} else console.log(`(pas de version figée : lancez d'abord node outils/fichier-fige.mjs)`);

// La ligne de cette version dans VERSIONS.md, ajoutée ou remplacée.
const vf = path.join(racine, "VERSIONS.md");
const lignes = fs.readFileSync(vf, "utf8").split("\n").filter((l) => !l.startsWith(`| ${v} |`));
const i = lignes.findIndex((l) => l.startsWith("|---"));
lignes.splice(i + 1, 0, `| ${v} | ${new Date().toISOString().slice(0, 10)} | \`${empreinteCourte(texte)}\` | ${sommeFige} |`);
fs.writeFileSync(vf, lignes.join("\n"));
