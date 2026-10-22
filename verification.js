/*
 * Kerckhoffs — vérification des versions.  /  Release verification.
 *
 * Tout le contrôle des versions est dans ce fichier, et nulle part ailleurs.
 *
 * Chaque version officielle contient empreintes.txt (le SHA-256 de chaque fichier) et empreintes.sig
 * (la signature de l'auteur sur cette liste). Avant de proposer une nouvelle version, la version
 * déjà installée, en qui vous avez confiance, relit tous les fichiers de la nouvelle et vérifie :
 *   1. que la liste est bien signée par la clé de l'auteur, inscrite ci-dessous ;
 *   2. que chaque fichier correspond exactement à la liste.
 * Si un seul octet diffère, la nouvelle version est signalée comme NON officielle.
 *
 * Ce fichier ne se connecte à rien : il lit uniquement les copies gardées sur l'appareil.
 */
(function () {
  "use strict";
  // Clé publique de l'auteur (Ed25519). Elle est aussi dans cle-publique.pem, à la racine du dépôt.
  const CLE_AUTEUR = "dN1LqN06mX2B2zB4u78bZFF9iSRQLWOpGTmHW6PUZR0=";

  const octets = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const sha256 = async (buf) => hex(await crypto.subtle.digest("SHA-256", buf));
  const courte = (h) => h.slice(0, 16).toUpperCase().match(/.{4}/g).join("-");

  // lire(chemin) rend le contenu d'un fichier (ArrayBuffer), ou null s'il manque.
  async function verifier(lire) {
    const res = { ok: false, version: null, empreinte: null, raison: "" };
    try {
      if (!window.nacl || !crypto.subtle) { res.raison = "Ce navigateur ne sait pas vérifier les signatures."; return res; }
      const txt = await lire("empreintes.txt"), sig = await lire("empreintes.sig");
      if (!txt || !sig) { res.raison = "Cette version ne porte aucune signature."; return res; }
      res.empreinte = courte(await sha256(txt));
      if (!nacl.sign.detached.verify(new Uint8Array(txt), new Uint8Array(sig), octets(CLE_AUTEUR))) {
        res.raison = "La signature ne correspond pas à celle de l'auteur."; return res;
      }
      const lignes = new TextDecoder().decode(txt).split("\n").filter(Boolean);
      const attendu = new Map(lignes.map((l) => { const i = l.indexOf("  "); return [l.slice(i + 2), l.slice(0, i)]; }));
      if (!attendu.has("index.html") || !attendu.has("sw.js") || !attendu.has("verification.js")) { res.raison = "La liste signée est incomplète."; return res; }
      attendu.set("./", attendu.get("index.html")); // la page d'accueil est index.html
      for (const [f, h] of attendu) {
        const contenu = await lire(f);
        if (!contenu) { res.raison = `Fichier manquant : ${f}`; return res; }
        if ((await sha256(contenu)) !== h) { res.raison = `Fichier modifié : ${f}`; return res; }
      }
      const sw = new TextDecoder().decode(await lire("sw.js"));
      res.version = (sw.match(/kerckhoffs-v([0-9.]+)/) || [])[1] || "?";
      res.ok = true;
    } catch (e) { res.raison = "La vérification n'a pas pu se faire."; }
    return res;
  }

  // Lit les fichiers d'une copie gardée sur l'appareil (le cache du mode avion).
  async function verifierCopie(nomCache) {
    if (!window.caches || !(await caches.has(nomCache))) return { ok: false, absente: true, raison: "Aucune copie sur l'appareil." };
    const c = await caches.open(nomCache);
    return verifier(async (f) => {
      const r = await c.match(new URL(f, document.baseURI).href, { ignoreSearch: true });
      return r ? r.arrayBuffer() : null;
    });
  }

  // Les messages de l'auteur (annonces, adresse des dons…) sont signés avec la même clé que les versions.
  // Format :
  //   -----DÉBUT MESSAGE KERCKHOFFS-----
  //   le texte
  //   -----SIGNATURE-----
  //   la signature en base64
  //   -----FIN-----
  // Le texte est d'abord « nettoyé » de la même façon qu'à la signature (outils/signer-message.mjs),
  // pour qu'un copier-coller qui ajoute des espaces en début ou en fin de ligne ou change les retours à la ligne ne gêne pas.
  function nettoyer(t) {
    return String(t).normalize("NFC").replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/^[ \t\u00a0]+|[ \t\u00a0]+$/g, "")).join("\n").replace(/^\n+|\n+$/g, "");
  }
  function verifierMessage(bloc) {
    const m = String(bloc).replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/^[ \t\u00a0]+|[ \t\u00a0]+$/g, "")).join("\n").match(/-----DÉBUT MESSAGE KERCKHOFFS-----\n([\s\S]*?)\n-----SIGNATURE-----\n([A-Za-z0-9+\/=\s]+?)\n?-----FIN-----/);
    if (!m) return { ok: false, raison: "Le message n'est pas complet. Copiez-le de « DÉBUT » à « FIN »." };
    try {
      const texte = new TextEncoder().encode(nettoyer(m[1]));
      const sig = octets(m[2].replace(/\s+/g, ""));
      if (sig.length !== 64) return { ok: false, raison: "La signature est abîmée." };
      return nacl.sign.detached.verify(texte, sig, octets(CLE_AUTEUR))
        ? { ok: true } : { ok: false, raison: "Le texte a été modifié, ou il ne vient pas de l'auteur." };
    } catch (e) { return { ok: false, raison: "La signature est illisible." }; }
  }

  window.KerckhoffsVerification = { verifier, verifierCopie, verifierMessage, nettoyer, CLE_AUTEUR };
})();
