/*
 * Kerckhoffs — service worker.
 * 1. Garde une copie de l'application sur l'appareil : elle fonctionne en mode avion,
 *    et c'est toujours cette copie, vérifiée, qui s'ouvre.
 * 2. Une nouvelle version est mise de côté sans être utilisée. L'application vérifie d'abord
 *    sa signature (verification.js) et ne l'active que si vous acceptez.
 * 3. Second verrou : refuse toute requête vers un autre site que celui de Kerckhoffs.
 * Changez VERSION à chaque mise à jour de l'application, puis signez-la (outils/signer.mjs).
 */
const VERSION = "kerckhoffs-v0.5.0";
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
  "icons/icon-512.png",
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

self.addEventListener("install", (e) => {
  // cache: "reload" : toujours prendre les fichiers frais du serveur, jamais une vieille copie du navigateur.
  // Pas d'activation automatique : la nouvelle version attend d'être vérifiée et acceptée.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
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
  if (e.request.method !== "GET") return;
  // Toujours la copie vérifiée gardée sur l'appareil. Internet ne sert qu'à l'installer.
  e.respondWith(
    caches.open(VERSION)
      .then((c) => c.match(e.request, { ignoreSearch: true }))
      .then((hit) => hit || fetch(e.request))
  );
});
