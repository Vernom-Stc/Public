/*
 * Kerckhoffs — service worker.
 * 1. Garde une copie de l'application sur l'appareil : elle fonctionne en mode avion,
 *    et c'est toujours cette copie, vérifiée, qui s'ouvre.
 * 2. Jamais de mise à jour toute seule : une nouvelle version n'est que signalée. Elle ne s'installe que si
 *    vous allez la chercher, puis l'application vérifie sa signature (verification.js) avant de vous la proposer.
 * 3. Second verrou : refuse toute requête vers un autre site que celui de Kerckhoffs.
 * Changez VERSION à chaque mise à jour de l'application, puis signez-la (outils/signer.mjs).
 */
const VERSION = "kerckhoffs-v0.8.3";
const FILES = [
  "./",
  "index.html",
  "app.css",
  "app.js",
  "verification.js",
  "sw.js",
  "empreintes.txt",
  "empreintes.sig",
  "manifest.webmanifest",
  "rules/registre.js",
  "rules/commun.js",
  "rules/cerbere.js",
  "rules/etiquettes.js",
  "rules/pays/ch.js",
  "icons/icon.svg",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "vendor/pdfjs/pdf.min.js",
  "vendor/pdfjs/pdf.worker.min.js",
  "vendor/jspdf/jspdf.umd.min.js",
  "vendor/tesseract/tesseract.min.js",
  "vendor/qrcode/qrcode.js",
  "vendor/jsqr/jsQR.js",
  "vendor/tweetnacl/nacl.min.js",
  "vendor/tesseract/worker.min.js",
  "vendor/tesseract/core/tesseract-core-lstm.wasm.js",
  "vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
  "vendor/tesseract/lang/fra.traineddata.gz",
];

// Aucune mise à jour toute seule. Une nouvelle version ne s'installe que si la personne est allée la chercher
// (bouton « Chercher une nouvelle version »), dans les dix dernières minutes. Sinon, elle est seulement signalée,
// et rien n'est installé : la version en place reste exactement celle qui a été vérifiée.
const DEMANDE = "kerckhoffs-demande";
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    // Seule exception : quitter une version d'essai d'avant cette règle (0.5.0 ou plus ancienne), qui n'a pas de bouton pour demander.
    const num = (k) => k.replace("kerckhoffs-v", "").split(".").map(Number);
    const essai = (await caches.keys()).filter((k) => /^kerckhoffs-v[0-9.]+$/.test(k) && k !== VERSION)
      .every((k) => { const [a, b, c] = num(k); return a === 0 && (b < 5 || (b === 5 && (c || 0) === 0)); });
    if (self.registration.active && !essai) { // une version est en place : on ne la remplace que sur demande
      const url = new URL("demande", self.registration.scope).href;
      const c = await caches.open(DEMANDE), d = await c.match(url);
      await c.delete(url);
      const quand = d ? Number(await d.text()) : 0;
      if (!(Date.now() - quand < 10 * 60 * 1000)) {
        for (const client of await self.clients.matchAll({ includeUncontrolled: true })) {
          client.postMessage({ type: "version-disponible", version: VERSION.replace("kerckhoffs-v", "") });
        }
        throw new Error("Mise à jour non demandée : rien n'est installé.");
      }
    }
    // cache: "reload" : toujours prendre les fichiers frais du serveur, jamais une vieille copie du navigateur.
    // Même demandée, la nouvelle version attend encore : elle est d'abord vérifiée, puis acceptée ou non.
    const c = await caches.open(VERSION);
    await c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })));
  })());
});

self.addEventListener("message", (e) => {
  if (e.data === "activer") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) {
    e.respondWith(Response.error()); // aucune sortie vers un autre site
    return;
  }
  // « Partager » vers Kerckhoffs (Android) : le téléphone remet le fichier ici. Il est gardé un instant sur l'appareil,
  // le temps que la page l'ouvre (puis elle l'efface aussitôt). Rien ne sort de l'appareil.
  if (e.request.method === "POST" && url.pathname.endsWith("/partage")) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        await caches.delete("kerckhoffs-partage");
        const c = await caches.open("kerckhoffs-partage");
        let i = 0;
        for (const f of fd.getAll("fichiers")) {
          if (!f || typeof f === "string" || !f.size) continue;
          await c.put(new URL("partage/" + i++, self.registration.scope).href,
            new Response(f, { headers: { "content-type": f.type || "application/octet-stream", "x-nom": encodeURIComponent(f.name || "document") } }));
        }
      } catch (err) { /* rien à ouvrir */ }
      return Response.redirect(new URL("./?partage=1", self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== "GET") return;
  // Toujours la copie vérifiée gardée sur l'appareil. Internet ne sert qu'à l'installer.
  e.respondWith(
    caches.open(VERSION)
      .then((c) => c.match(e.request, { ignoreSearch: true }))
      .then((hit) => hit || fetch(e.request))
  );
});
