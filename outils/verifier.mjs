#!/usr/bin/env node
/*
 * Kerckhoffs — vérifier une version.  /  Verify a release.
 *
 *   node outils/verifier.mjs [dossier]
 *
 * Vérifie que chaque fichier correspond à empreintes.txt, et que empreintes.txt est bien signé
 * par la clé publique de l'auteur. Sans Node, les mêmes vérifications se font avec deux commandes :
 *   sha256sum -c empreintes.txt
 *   openssl pkeyutl -verify -pubin -inkey cle-publique.pem -rawin -in empreintes.txt -sigfile empreintes.sig
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { texteEmpreintes, empreinteCourte, version } from "./empreintes.mjs";

const racine = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const lire = (f) => fs.readFileSync(path.join(racine, f));
let ok = true;
const ko = (m) => { ok = false; console.log("✗ " + m); };

const publiee = lire("empreintes.txt").toString("utf8");
const calculee = texteEmpreintes(racine);
if (publiee !== calculee) {
  const a = new Map(publiee.trim().split("\n").map((l) => l.split("  ").reverse()));
  for (const l of calculee.trim().split("\n")) {
    const [h, f] = l.split("  ");
    if (a.get(f) !== h) ko(`${f} ne correspond pas à empreintes.txt`);
    a.delete(f);
  }
  for (const f of a.keys()) ko(`${f} est dans empreintes.txt mais plus dans l'application`);
  if (ok) ko("empreintes.txt n'est pas à jour");
}
const cle = crypto.createPublicKey(lire("cle-publique.pem"));
if (!crypto.verify(null, Buffer.from(publiee, "utf8"), cle, lire("empreintes.sig"))) ko("la signature ne correspond pas : cette version n'est pas signée par l'auteur");

// La clé inscrite dans l'application doit être la même que cle-publique.pem.
const brute = cle.export({ type: "spki", format: "der" }).subarray(-32).toString("base64");
const dansApp = (lire("verification.js").toString("utf8").match(/CLE_AUTEUR = "([^"]+)"/) || [])[1];
if (dansApp !== brute) ko("la clé publique inscrite dans verification.js n'est pas celle de cle-publique.pem");

// La version figée, si elle est là : signée elle aussi, avec la même clé.
const fige = `telecharger/kerckhoffs-${version(racine)}.html`;
if (fs.existsSync(path.join(racine, fige))) {
  if (!fs.existsSync(path.join(racine, fige + ".sig")) || !crypto.verify(null, lire(fige), cle, lire(fige + ".sig"))) ko(`${fige} n'est pas signé par l'auteur`);
  else console.log(`✓ ${fige} signé par l'auteur`);
}

console.log(ok ? `✓ Version ${version(racine)} signée par l'auteur. Empreinte : ${empreinteCourte(publiee)}` : "\nCette version n'est PAS la version officielle signée.");
process.exit(ok ? 0 : 1);
