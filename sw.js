/*
 * Kerckhoffs — service worker.
 * 1. Garde une copie de l'application sur l'appareil pour fonctionner en mode avion.
 * 2. Second verrou : refuse toute requête vers un autre site que celui de Kerckhoffs.
 * Changez VERSION à chaque mise à jour de l'application.
 */
const VERSION = "kerckhoffs-v0.4.6";
const FILES = [
  "./",
  "index.html",
  "app.css",
  "app.js",
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
  "vendor/tesseract/worker.min.js",
  "vendor/tesseract/core/tesseract-core-lstm.wasm.js",
  "vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
  "vendor/tesseract/lang/fra.traineddata.gz",
];

self.addEventListener("install", (e) => {
  // cache: "reload" : toujours prendre les fichiers frais du serveur, jamais une vieille copie du navigateur.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
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
  // Les gros fichiers (moteur de lecture, bibliothèques) : copie locale d'abord.
  if (url.pathname.includes("/vendor/")) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
    return;
  }
  // L'application elle-même : la dernière version en ligne si possible, la copie locale en mode avion.
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
