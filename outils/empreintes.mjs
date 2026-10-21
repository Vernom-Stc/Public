/*
 * Kerckhoffs — l'empreinte d'une version.  /  The fingerprint of a version.
 *
 * La liste des fichiers est celle que l'application garde pour le mode avion (FILES dans sw.js).
 * empreintes.txt contient le SHA-256 de chacun, au format de la commande sha256sum.
 * L'empreinte de la version est le SHA-256 de empreintes.txt, en 4 groupes : 7F3A-91C2-0B4D-55E8.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const HORS_LISTE = new Set(["./", "empreintes.txt", "empreintes.sig"]);

export function fichiers(racine) {
  const sw = fs.readFileSync(path.join(racine, "sw.js"), "utf8");
  const bloc = sw.match(/const FILES = \[([\s\S]*?)\];/);
  if (!bloc) throw new Error("Liste FILES introuvable dans sw.js");
  const liste = [...bloc[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((f) => !HORS_LISTE.has(f));
  if (!liste.includes("sw.js")) liste.push("sw.js");
  return [...new Set(liste)].sort();
}

export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export function texteEmpreintes(racine) {
  return fichiers(racine).map((f) => `${sha256(fs.readFileSync(path.join(racine, f)))}  ${f}\n`).join("");
}

export const empreinteCourte = (texte) => sha256(Buffer.from(texte, "utf8")).slice(0, 16).toUpperCase().match(/.{4}/g).join("-");

export const version = (racine) => (fs.readFileSync(path.join(racine, "sw.js"), "utf8").match(/kerckhoffs-v([0-9.]+)/) || [])[1];
