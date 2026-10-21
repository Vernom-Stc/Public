/*
 * « 1883. Il faut qu'il n'exige pas le secret, et qu'il puisse sans inconvénient tomber entre les mains de l'ennemi. Kerckhoffs. »
 *
 * Kerckhoffs — masquez vos données avant de travailler avec une IA.
 * Licence Apache 2.0. Tout se passe sur l'appareil : ce fichier ne contacte aucun serveur.
 */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_DIM = 2400;          // taille maximale d'une page, en pixels
  const LIGHT_DIM = 1600;        // taille maximale d'une image allégée
  const abs = (p) => new URL(p, location.href).href;

  pdfjsLib.GlobalWorkerOptions.workerSrc = abs("vendor/pdfjs/pdf.worker.min.js");

  // Règles : communes + celles du pays choisi (rules/pays/*.js). Les longs numéros passent en dernier.
  const K = window.Kerckhoffs;
  let paysChoisi = "CH";
  try { paysChoisi = localStorage.getItem("kerckhoffs-pays") || "CH"; } catch (e) {}
  if (!K.pays[paysChoisi]) paysChoisi = Object.keys(K.pays)[0];
  const rules = () => K.commun.concat(K.pays[paysChoisi] ? K.pays[paysChoisi].regles : [])
    .sort((a, b) => (a.id === "longnum") - (b.id === "longnum"));
  (function remplirPays() {
    const sel = document.getElementById("pays");
    Object.values(K.pays).sort((a, b) => a.nom.localeCompare(b.nom)).forEach((p) => {
      const o = document.createElement("option");
      o.value = p.code; o.textContent = p.nom; o.selected = p.code === paysChoisi;
      sel.append(o);
    });
    sel.addEventListener("change", () => {
      paysChoisi = sel.value;
      try { localStorage.setItem("kerckhoffs-pays", paysChoisi); } catch (e) {}
      if (S.pages.length) { S.tokens = new Map(); S.counters = {}; detectPages(S.pages); }
    });
  })();

  const FORMATS = {
    quick: [["image", "Image"], ["light", "Image allégée"], ["text", "Texte seul"]],
    folder: [["pdf", "PDF"], ["light", "Image allégée"], ["text", "Texte seul"]],
  };

  /* ------------------------------------------------------------------ état */
  const S = {
    mode: "quick",
    pages: [],          // { img, name, strokes:[], boxes:[], lines:null }
    cur: 0,
    tokens: new Map(),  // clé -> { token, type, value }
    counters: {},
    view: { s: 1, tx: 0, ty: 0 },
    version: 0,         // change à chaque modification
    cache: null,        // { key, out } dernier export préparé
    extra: [],          // motifs ajoutés par « Masquer tous les pareils » (pour cette session)
    sel: null,          // zone sélectionnée au rectangle : { page, rect }
    leaving: false,
  };
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  const page = () => S.pages[S.cur];
  const changed = () => { S.version++; };

  // Le message s'affiche sous l'image et, bien visible, par-dessus l'image.
  let busy = false;
  let toastTimer = null;
  function setStatus(t, keep) {
    $("status").textContent = t || "";
    const el = $("toast");
    clearTimeout(toastTimer);
    if (!t || $("work").hidden) { el.hidden = true; return; }
    el.textContent = t; el.hidden = false;
    if (!keep && !busy) toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  /* ------------------------------------------------------------ navigation */
  function openWork(mode) {
    S.mode = mode;
    wipe();
    $("home").hidden = true;
    $("work").hidden = false;
    $("workTitle").textContent = mode === "quick" ? "Photo rapide" : "Dossier";
    $("inFile").multiple = mode !== "quick";
    $("btnFile").textContent = mode === "quick" ? "Importer une image" : "Importer une image ou un PDF";
    $("emptyFile").textContent = $("btnFile").textContent;
    closeSheet();
    if (mode === "folder") setTimeout(() => { if (!S.pages.length) openSheet(); }, 50); // d'abord : ce qu'il faut masquer
    $("inFile").accept = mode === "quick" ? "image/*" : "application/pdf,image/*";
    buildFormats();
    updateUI();
    window.scrollTo(0, 0);
  }

  function wipe() {
    S.pages = []; S.cur = 0; S.tokens = new Map(); S.counters = {}; S.cache = null; S.leaving = false;
    S.extra = []; S.sel = null; $("selbar").hidden = true;
    S.cadre = null; $("cropbar").hidden = true;
    profilSnapshot = "";
    history.length = 0;
    ["tNames", "tAddr", "tOther"].forEach((id) => { $(id).value = ""; });
    $("optMask").checked = true;
    setStatus("");
    changed();
  }

  function quitter() {
    wipe(); fermerCamera();
    $("work").hidden = true;
    $("home").hidden = false;
  }
  $("back").addEventListener("click", () => {
    if (profilModifie()) { $("finSession").hidden = false; return; } // garder les mots appris ?
    if (S.pages.length && !S.leaving) {
      S.leaving = true;
      setStatus("Touchez encore « Accueil » pour tout effacer et revenir.");
      setTimeout(() => { S.leaving = false; }, 4000);
      return;
    }
    wipe(); fermerCamera();
    $("work").hidden = true;
    $("home").hidden = false;
  });

  function buildFormats() {
    const box = $("formats");
    box.textContent = "";
    FORMATS[S.mode].forEach(([val, label], i) => {
      const l = document.createElement("label");
      const r = document.createElement("input");
      r.type = "radio"; r.name = "fmt"; r.value = val; r.id = "fmt-" + val; r.checked = i === 0;
      r.addEventListener("change", () => { changed(); updateUI(); });
      l.append(r, document.createTextNode(" " + label));
      box.append(l);
    });
  }
  const fmt = () => (document.querySelector('input[name="fmt"]:checked') || {}).value;

  function updateUI() {
    const has = S.pages.length > 0;
    $("empty").hidden = has;
    $("tampon").hidden = !has;
    cv.hidden = !has;
    ["detect", "btnShare", "btnCopy", "btnSave"].forEach((id) => { $(id).disabled = !has; });
    updateUndo();
    $("pageInfo").textContent = S.pages.length > 1 ? `page ${S.cur + 1} / ${S.pages.length}` : "";
    $("btnCam").textContent = S.mode === "quick" ? "Photo" : "+ Page";
    $("btnCam").hidden = !has;
    const pg = $("pages");
    pg.hidden = S.pages.length < 2;
    pg.textContent = "";
    S.pages.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = "Page " + (i + 1);
      b.setAttribute("aria-current", i === S.cur ? "true" : "false");
      b.addEventListener("click", () => { S.cur = i; fitView(); render(); updateUI(); });
      pg.append(b);
    });
    $("btnCopy").textContent = fmt() === "text" ? "Copier le texte" : "Copier l'image";
    renderLegend();
  }

  /* ------------------------------------------------------- chargement */
  async function loadImage(file) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      const url = URL.createObjectURL(file);
      try {
        const im = new Image();
        im.decoding = "async";
        im.src = url;
        await im.decode();
        return im;
      } finally { URL.revokeObjectURL(url); }
    }
  }

  // Redessiner l'image sur un canvas supprime toutes les métadonnées (GPS, date, appareil).
  function toCanvas(src, w, h) {
    const k = Math.min(1, MAX_DIM / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  const newPage = (img, name) => ({ img, name, strokes: [], boxes: [], lines: null });

  async function addFiles(files) {
    if (!files.length) return;
    const added = [];
    for (const f of files) {
      try {
        if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
          setStatus("Lecture du PDF…");
          // Le PDF est redessiné en images : texte caché, calques, formulaires et métadonnées disparaissent.
          const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer(), isEvalSupported: false, disableFontFace: false }).promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            const pg = await pdf.getPage(i);
            const v0 = pg.getViewport({ scale: 1 });
            const vp = pg.getViewport({ scale: Math.min(3, MAX_DIM / Math.max(v0.width, v0.height)) });
            const c = document.createElement("canvas");
            c.width = Math.round(vp.width); c.height = Math.round(vp.height);
            const x = c.getContext("2d");
            x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
            await pg.render({ canvasContext: x, viewport: vp, annotationMode: 0 }).promise;
            added.push(newPage(c, `${f.name} p.${i}`));
          }
          pdf.destroy();
        } else {
          const im = await loadImage(f);
          const c = toCanvas(im, im.width, im.height);
          if (await estUnProfil(c)) continue; // c'est un QR code de profil, pas une page
          added.push(newPage(c, f.name || "photo"));
          if (im.close) im.close();
        }
      } catch (e) {
        setStatus(`Impossible de lire « ${f.name} ». Essayez une photo ou un PDF.`);
      }
    }
    addPages(added);
  }

  function addPages(added) {
    if (!added.length) return;
    closeSheet();
    if (S.mode === "quick") { S.pages = [added[0]]; S.tokens = new Map(); S.counters = {}; S.cur = 0; }
    else { S.pages.push(...added); S.cur = S.pages.length - added.length; }
    changed();
    setStatus("");
    updateUI();
    requestAnimationFrame(() => { fitView(); render(); });
    detectPages(added); // la détection démarre toute seule, dans les deux modes
  }

  /* ------------- caméra intégrée : la photo reste sur l'ardoise, jamais dans la galerie */
  let flux = null;
  const piste = () => (flux ? flux.getVideoTracks()[0] : null);
  const VIDEO = { width: { ideal: 4096 }, height: { ideal: 3072 } };

  // Sur les téléphones à plusieurs objectifs, on évite l'ultra grand-angle (souvent sans mise au point) :
  // on préfère l'objectif arrière principal, en général le premier listé (« camera2 0, facing back »).
  async function meilleureCameraArriere() {
    try {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      const arriere = cams.filter((d) => /back|arri|rear|environment/i.test(d.label));
      if (!arriere.length) return null;
      const num = (d) => { const m = d.label.match(/camera2?\s*(\d+)/i); return m ? +m[1] : 99; };
      return arriere.sort((x, y) => num(x) - num(y))[0].deviceId;
    } catch (e) { return null; }
  }

  async function reglerMiseAuPoint() {
    const t = piste(); if (!t || !t.getCapabilities) return;
    const cap = t.getCapabilities();
    const avance = {};
    if (cap.focusMode && cap.focusMode.includes("continuous")) avance.focusMode = "continuous";
    if (cap.exposureMode && cap.exposureMode.includes("continuous")) avance.exposureMode = "continuous";
    if (cap.whiteBalanceMode && cap.whiteBalanceMode.includes("continuous")) avance.whiteBalanceMode = "continuous";
    if (Object.keys(avance).length) { try { await t.applyConstraints({ advanced: [avance] }); } catch (e) {} }
    $("camTorch").hidden = !cap.torch;
  }

  async function ouvrirCamera() {
    closeSheet();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $("inCam").click(); return; }
    try {
      flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, ...VIDEO }, audio: false });
      // Une fois l'accès accordé, les noms des caméras sont connus : on bascule sur l'objectif principal si besoin.
      const id = await meilleureCameraArriere();
      if (id && piste().getSettings().deviceId !== id) {
        flux.getTracks().forEach((t) => t.stop());
        flux = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id }, ...VIDEO }, audio: false });
      }
    } catch (e) {
      setStatus("La caméra n'est pas autorisée pour Kerckhoffs : l'appareil photo du téléphone va s'ouvrir, et il peut ranger la photo dans la galerie.");
      $("inCam").click();
      return;
    }
    const v = $("camVideo");
    v.srcObject = flux;
    $("camView").hidden = false;
    torche = false; $("camTorch").setAttribute("aria-pressed", "false");
    try { await v.play(); } catch (e) {}
    reglerMiseAuPoint();
  }
  function fermerCamera() {
    if (flux) flux.getTracks().forEach((t) => t.stop());
    flux = null;
    $("camVideo").srcObject = null;
    $("camView").hidden = true;
  }

  // Toucher l'image : mise au point à cet endroit, quand le téléphone le permet.
  $("camVideo").addEventListener("click", async (e) => {
    const t = piste(); if (!t || !t.getCapabilities) return;
    const cap = t.getCapabilities(), r = e.currentTarget.getBoundingClientRect();
    const pt = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    const anneau = $("camFocus");
    anneau.style.left = (e.clientX - r.left) + "px"; anneau.style.top = (e.clientY - r.top) + "px";
    anneau.hidden = false; setTimeout(() => { anneau.hidden = true; }, 900);
    try {
      const avance = { pointsOfInterest: [pt] };
      if (cap.focusMode && cap.focusMode.includes("single-shot")) avance.focusMode = "single-shot";
      await t.applyConstraints({ advanced: [avance] });
      setTimeout(reglerMiseAuPoint, 1500); // puis retour à la mise au point continue
    } catch (err) {}
  });

  let torche = false;
  $("camTorch").addEventListener("click", async () => {
    const t = piste(); if (!t) return;
    torche = !torche;
    try { await t.applyConstraints({ advanced: [{ torch: torche }] }); } catch (e) { torche = false; }
    $("camTorch").setAttribute("aria-pressed", torche ? "true" : "false");
  });

  $("camShot").addEventListener("click", async () => {
    const v = $("camVideo");
    if (!v.videoWidth) return;
    $("camShot").disabled = true;
    let c = null;
    // Une vraie photo (meilleure netteté) si le téléphone le permet, sinon une image de la vidéo.
    // Dans les deux cas, elle reste en mémoire : rien n'est écrit sur le téléphone.
    try {
      if ("ImageCapture" in window) {
        const blob = await new ImageCapture(piste()).takePhoto();
        const im = await createImageBitmap(blob);
        c = toCanvas(im, im.width, im.height); im.close && im.close();
      }
    } catch (e) { c = null; }
    if (!c) c = toCanvas(v, v.videoWidth, v.videoHeight);
    $("camShot").disabled = false;
    fermerCamera();
    estUnProfil(c).then((profil) => { if (!profil) addPages([newPage(c, "photo")]); });
  });
  $("camSysteme").addEventListener("click", () => {
    fermerCamera();
    setStatus("Appareil photo du téléphone : il peut ranger la photo dans la galerie. Pensez à la supprimer ensuite.");
    $("inCam").click();
  });
  $("camCancel").addEventListener("click", fermerCamera);
  $("btnCam").addEventListener("click", ouvrirCamera);
  $("emptyCam").addEventListener("click", ouvrirCamera);
  $("btnFile").addEventListener("click", () => $("inFile").click());
  $("emptyFile").addEventListener("click", () => $("inFile").click());

  // Réglages : un panneau qui monte du bas de l'écran
  function openSheet() { $("sheet").hidden = false; $("backdrop").hidden = false; }
  function closeSheet() { $("sheet").hidden = true; $("backdrop").hidden = true; }
  $("btnOpts").addEventListener("click", openSheet);
  $("closeSheet").addEventListener("click", closeSheet);
  $("backdrop").addEventListener("click", () => { closeSheet(); if (!$("cerbere").hidden) fermerCerbere(); });
  $("inCam").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
  $("inFile").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });

  /* -------------------------------------------------------- affichage */
  function applyView() {
    const v = S.view;
    cv.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
  }
  // Le bouton « Ajuster » apparaît dès que l'image n'est plus en vue entière.
  function showFit() {
    const v = S.view;
    const atFit = Math.abs(v.s - v.fit) < 0.001 && Math.abs(v.tx - v.tx0) < 1 && Math.abs(v.ty - v.ty0) < 1;
    $("fit").hidden = !page() || atFit;
  }
  function fitView() {
    const p = page(); if (!p) return;
    cv.width = p.img.width; cv.height = p.img.height;
    const r = $("viewport").getBoundingClientRect();
    const s = Math.min(r.width / p.img.width, r.height / p.img.height);
    S.view = { s, tx: (r.width - p.img.width * s) / 2, ty: (r.height - p.img.height * s) / 2, fit: s };
    S.view.tx0 = S.view.tx; S.view.ty0 = S.view.ty;
    applyView(); $("fit").hidden = true;
  }

  // Un élément dessiné : un trait de pinceau { kind:"line", w, pts } ou un rectangle { kind:"rect", x, y, w, h }.
  function strokePath(c, st) {
    c.save();
    c.fillStyle = "#000"; c.strokeStyle = "#000";
    if (st.kind === "rect") { c.fillRect(st.x, st.y, st.w, st.h); c.restore(); return; }
    c.lineCap = "round"; c.lineJoin = "round"; c.lineWidth = st.w;
    if (st.pts.length === 1) {
      c.beginPath(); c.arc(st.pts[0][0], st.pts[0][1], st.w / 2, 0, Math.PI * 2); c.fill();
    } else {
      c.beginPath(); c.moveTo(st.pts[0][0], st.pts[0][1]);
      for (let i = 1; i < st.pts.length; i++) c.lineTo(st.pts[i][0], st.pts[i][1]);
      c.stroke();
    }
    c.restore();
  }

  function drawBox(c, b, final) {
    const rects = b.rects || [b];
    c.save();
    if (b.active) {
      c.fillStyle = "#000";
      rects.forEach((r) => c.fillRect(r.x, r.y, r.w, r.h));
      // L'étiquette va dans le plus large rectangle, si elle y tient.
      const r = rects.reduce((m, x) => (x.w > m.w ? x : m), rects[0]);
      const fs = Math.min(r.h * 0.6, r.w / (b.token.length * 0.62));
      if (fs >= 7) {
        c.fillStyle = "#fff"; c.font = `600 ${fs}px ui-monospace, Menlo, Consolas, monospace`;
        c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(b.token, r.x + r.w / 2, r.y + r.h / 2, r.w - 4);
      }
    } else if (!final) {
      c.setLineDash([10, 6]); c.lineWidth = Math.max(2, cv.width / 600); c.strokeStyle = "#002366";
      rects.forEach((r) => c.strokeRect(r.x, r.y, r.w, r.h));
    }
    if (!final && b.active && b.flag) {
      c.lineWidth = Math.max(3, cv.width / 400); c.strokeStyle = "#e08a1e";
      rects.forEach((r) => c.strokeRect(r.x, r.y, r.w, r.h));
    }
    c.restore();
  }

  function paint(c, p, masked, final) {
    c.drawImage(p.img, 0, 0);
    if (!masked) return;
    p.strokes.forEach((st) => strokePath(c, st));
    p.boxes.forEach((b) => drawBox(c, b, final));
  }
  function render() {
    const p = page(); if (!p) return;
    paint(ctx, p, true, false);
    if (S.cadre && S.cadre.page === p) dessinerCadre(S.cadre.rect);
    // Point signalé par Cerbère : encadré en orange.
    if (S.flash && S.flash.page === p) {
      ctx.save(); ctx.lineWidth = Math.max(4, cv.width / 300); ctx.strokeStyle = "#ff7a00"; ctx.fillStyle = "rgba(255,122,0,.18)";
      S.flash.rects.forEach((r) => { ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h); });
      ctx.restore();
    }
    // Zone sélectionnée au rectangle : en surbrillance, en attente d'un choix.
    if (S.sel && S.sel.page === p) {
      const r = S.sel.rect;
      ctx.save();
      ctx.fillStyle = "rgba(60,110,230,.28)"; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([12, 8]); ctx.lineWidth = Math.max(3, cv.width / 400); ctx.strokeStyle = "#2b5fe0";
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }
  }

  /* ---------------------- doigt : pinceau, rectangle, gomme, zoom, retour */
  const ptrs = new Map();
  let draft = null, moved = false, downAt = null, pinch = null;
  let tool = "brush";
  const history = []; // actions à annuler : { type:"add"|"remove"|"toggle", page, item, index }

  function toImg(cx, cy) {
    const r = $("viewport").getBoundingClientRect();
    return [(cx - r.left - S.view.tx) / S.view.s, (cy - r.top - S.view.ty) / S.view.s];
  }
  const brushW = () => (+$("brush").value / 100) * Math.max(320, Math.min(cv.width, cv.height));

  document.querySelectorAll('input[name="tool"]').forEach((r) => r.addEventListener("change", () => {
    tool = r.value;
    if (S.sel) unselect();
    if (S.cadre) annulerCadre();
    $("cropScreen").hidden = tool !== "crop" || !page();
    const hints = {
      move: "Un doigt : faire glisser l'image. Deux doigts : zoomer. « Ajuster » revient à la vue entière.",
      brush: "Un doigt : effacer au pinceau. Deux doigts : zoomer et déplacer.",
      crop: "Zoomez et déplacez avec deux doigts pour ne voir que la feuille, puis touchez « Garder ce qui est à l'écran ». Ou glissez en diagonale autour de la feuille.",
      rect: "Glissez en diagonale pour sélectionner une zone, puis choisissez : la masquer, ou masquer tous les pareils (par exemple toutes les dates).",
      erase: "Touchez un trait ou un rectangle pour l'enlever. Touchez une zone détectée pour la démasquer.",
    };
    if (page()) setStatus(hints[tool]);
  }));

  function distSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)) : 0;
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }
  function hitItem(p, x, y) {
    const tol = 14 / S.view.s; // tolérance du doigt, en pixels d'image
    for (let i = p.strokes.length - 1; i >= 0; i--) {
      const st = p.strokes[i];
      if (st.kind === "rect") {
        if (x >= st.x - tol && x <= st.x + st.w + tol && y >= st.y - tol && y <= st.y + st.h + tol) return i;
      } else if (st.pts.length === 1) {
        if (Math.hypot(x - st.pts[0][0], y - st.pts[0][1]) <= st.w / 2 + tol) return i;
      } else {
        for (let k = 1; k < st.pts.length; k++) if (distSeg(x, y, st.pts[k - 1], st.pts[k]) <= st.w / 2 + tol) return i;
      }
    }
    return -1;
  }
  const hitBox = (p, x, y) => {
    const t = 8 / S.view.s;
    return [...p.boxes].reverse().find((b) => (b.rects || [b]).some((r) => x >= r.x - t && x <= r.x + r.w + t && y >= r.y - t && y <= r.y + r.h + t));
  };

  function toggleBox(p, b) { b.active = !b.active; history.push({ type: "toggle", page: p, item: b }); }
  function eraseAt(p, x, y) {
    const i = hitItem(p, x, y);
    if (i >= 0) { const [it] = p.strokes.splice(i, 1); history.push({ type: "remove", page: p, item: it, index: i }); return true; }
    const b = hitBox(p, x, y);
    if (b && b.active) { toggleBox(p, b); return true; }
    return false;
  }
  function afterEdit() { changed(); render(); renderLegend(); updateUndo(); }
  function updateUndo() { $("undo").disabled = !history.some((h) => S.pages.includes(h.page)); }

  const vp = $("viewport");
  vp.addEventListener("pointerdown", (e) => {
    if (!page()) return;
    vp.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) {
      downAt = [e.clientX, e.clientY]; moved = false;
      const pt = toImg(e.clientX, e.clientY);
      if (tool === "move") draft = { kind: "pan", pt, tx0: S.view.tx, ty0: S.view.ty };
      else if (tool === "brush") draft = { kind: "line", w: brushW(), pts: [pt] };
      else if (tool === "rect" || tool === "crop") draft = { kind: tool, x0: pt[0], y0: pt[1], x: pt[0], y: pt[1], w: 0, h: 0 };
      else { draft = { kind: "erase" }; if (eraseAt(page(), pt[0], pt[1])) afterEdit(); }
    } else if (ptrs.size === 2) {
      if (draft && draft.kind !== "erase") render();
      draft = null;
      const [a, b] = [...ptrs.values()];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      pinch = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]), s0: S.view.s, img: toImg(mid[0], mid[1]) };
    }
  });
  vp.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = vp.getBoundingClientRect();
      const mid = [(a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top];
      const s = Math.min(S.view.fit * 12, Math.max(S.view.fit * 0.8, pinch.s0 * d / pinch.d0));
      S.view.s = s; S.view.tx = mid[0] - pinch.img[0] * s; S.view.ty = mid[1] - pinch.img[1] * s;
      applyView(); showFit();
      return;
    }
    if (!draft) return;
    if (!moved && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) moved = true;
    if (!moved) return;
    const pt = toImg(e.clientX, e.clientY);
    if (draft.kind === "pan") {
      S.view.tx = draft.tx0 + (e.clientX - downAt[0]);
      S.view.ty = draft.ty0 + (e.clientY - downAt[1]);
      applyView(); showFit();
    } else if (draft.kind === "line") {
      const last = draft.pts[draft.pts.length - 1];
      draft.pts.push(pt);
      strokePath(ctx, { kind: "line", w: draft.w, pts: [last, pt] });
    } else if (draft.kind === "rect" || draft.kind === "crop") {
      draft.x = Math.min(draft.x0, pt[0]); draft.y = Math.min(draft.y0, pt[1]);
      draft.w = Math.abs(pt[0] - draft.x0); draft.h = Math.abs(pt[1] - draft.y0);
      render();
      if (draft.kind === "crop") dessinerCadre(draft);
      else { ctx.save(); ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(draft.x, draft.y, draft.w, draft.h); ctx.restore(); }
    } else if (eraseAt(page(), pt[0], pt[1])) afterEdit();
  });
  function endPointer(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) pinch = null; draft = null; return; }
    if (!draft) return;
    const p = page(), d = draft;
    draft = null;
    if (d.kind === "erase") return;
    if (d.kind === "pan") {
      if (!moved) { const hit = hitBox(p, d.pt[0], d.pt[1]); if (hit) { toggleBox(p, hit); afterEdit(); } }
      return;
    }
    if (!moved || (d.kind === "rect" && (d.w < 4 || d.h < 4))) {
      // Un simple toucher sur une zone détectée la masque ou la démasque.
      const [x, y] = d.kind === "line" ? d.pts[0] : [d.x0, d.y0];
      const hit = hitBox(p, x, y);
      if (hit) { toggleBox(p, hit); afterEdit(); return; }
      if (d.kind === "rect") { render(); return; }
    }
    if (d.kind === "crop") {
      if (d.w < 20 || d.h < 20) { render(); return; }
      S.cadre = { page: p, rect: { x: d.x, y: d.y, w: d.w, h: d.h } };
      $("cropbar").hidden = false; $("cropScreen").hidden = true; render();
      return;
    }
    if (d.kind === "rect") { select(p, { x: d.x, y: d.y, w: d.w, h: d.h }); return; }
    const item = d;
    p.strokes.push(item);
    history.push({ type: "add", page: p, item });
    afterEdit();
  }
  vp.addEventListener("pointerup", endPointer);
  vp.addEventListener("pointercancel", endPointer);
  vp.addEventListener("wheel", (e) => {
    if (!page()) return;
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    const m = [e.clientX - r.left, e.clientY - r.top];
    const img = toImg(e.clientX, e.clientY);
    const s = Math.min(S.view.fit * 12, Math.max(S.view.fit * 0.8, S.view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    S.view.s = s; S.view.tx = m[0] - img[0] * s; S.view.ty = m[1] - img[1] * s;
    applyView(); showFit();
  }, { passive: false });
  $("fit").addEventListener("click", (e) => { e.stopPropagation(); fitView(); render(); });
  $("fit").addEventListener("pointerdown", (e) => e.stopPropagation());
  window.addEventListener("resize", () => { if (page()) { fitView(); render(); } });

  // Retour : annule la dernière action (trait, rectangle, gomme, zone démasquée).
  $("undo").addEventListener("click", () => {
    while (history.length) {
      const h = history.pop();
      if (!S.pages.includes(h.page)) continue;
      if (h.type === "add") { const i = h.page.strokes.indexOf(h.item); if (i >= 0) h.page.strokes.splice(i, 1); }
      else if (h.type === "remove") h.page.strokes.splice(Math.min(h.index, h.page.strokes.length), 0, h.item);
      else if (h.type === "toggle") h.item.active = !h.item.active;
      else if (h.type === "crop") { Object.assign(h.page, h.avant); fitView(); detectPages([h.page]); }
      const pi = S.pages.indexOf(h.page);
      if (pi !== S.cur) { S.cur = pi; fitView(); updateUI(); }
      break;
    }
    afterEdit();
  });

  /* ------------------------------------- recadrer : ne garder que la feuille */
  function dessinerCadre(r) {
    ctx.save();
    ctx.fillStyle = "rgba(10,14,17,.6)";
    ctx.beginPath(); ctx.rect(0, 0, cv.width, cv.height); ctx.rect(r.x, r.y, r.w, r.h); ctx.fill("evenodd");
    ctx.setLineDash([14, 8]); ctx.lineWidth = Math.max(3, cv.width / 400); ctx.strokeStyle = "#ffd34d";
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }
  function annulerCadre() { S.cadre = null; $("cropbar").hidden = true; $("cropScreen").hidden = tool !== "crop" || !page(); render(); }
  // Ce qui est visible dans le cadre de l'écran, en coordonnées de l'image
  function zoneVisible() {
    const p = page(), r = $("viewport").getBoundingClientRect(), v = S.view;
    const x0 = Math.max(0, -v.tx / v.s), y0 = Math.max(0, -v.ty / v.s);
    const x1 = Math.min(p.img.width, (r.width - v.tx) / v.s), y1 = Math.min(p.img.height, (r.height - v.ty) / v.s);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  $("cropScreen").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("cropScreen").addEventListener("click", () => {
    if (!page()) return;
    S.cadre = { page: page(), rect: zoneVisible() };
    $("cropOk").click();
  });
  $("cropCancel").addEventListener("click", annulerCadre);
  $("cropbar").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("cropOk").addEventListener("click", () => {
    if (!S.cadre) return;
    const p = S.cadre.page, r = S.cadre.rect;
    const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
    const w = Math.min(p.img.width - x, Math.round(r.w)), h = Math.min(p.img.height - y, Math.round(r.h));
    if (w < 20 || h < 20) { annulerCadre(); return; }
    const avant = { img: p.img, strokes: p.strokes, lines: p.lines, boxes: p.boxes };
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(p.img, -x, -y);
    // Les traits déjà faits suivent le recadrage ; la lecture du texte est refaite sur la nouvelle image.
    p.strokes = p.strokes.map((st) => st.kind === "rect" ? { ...st, x: st.x - x, y: st.y - y } : { ...st, pts: st.pts.map(([px, py]) => [px - x, py - y]) });
    p.img = c; p.lines = null; p.boxes = [];
    history.push({ type: "crop", page: p, avant });
    S.cadre = null; $("cropbar").hidden = true;
    fitView(); changed(); render();
    $("cropScreen").hidden = tool !== "crop";
    detectPages([p]);
  });

  /* ------------------------------ sélection au rectangle : masquer, ou tous les pareils */
  const MOIS = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
  const DATE_RE = () => new RegExp(`(?:\\b\\d{1,2}[./-]\\d{1,2}[./-](?:\\d{4}|\\d{2})\\b|(?:\\b\\d{1,2}(?:er)?\\s+)?(?:${MOIS})\\s+\\d{4}\\b)`, "gi");

  // Transforme une forme (« 9999-9999 ») en règle de détection. Seuls des caractères simples sont acceptés.
  function formeVersRegle(forme) {
    const corps = [...forme].map((ch) => (ch === "9" ? "\\d" : ch === " " ? "\\s?" : ch.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&"))).join("");
    const re = new RegExp((/^[A-Za-z0-9]/.test(forme) ? "\\b" : "") + corps + (/[A-Za-z0-9]$/.test(forme) ? "\\b" : ""), "gi");
    return { id: "forme-" + forme, type: "MOTIF", re, forme };
  }

  function select(p, rect) {
    S.sel = { page: p, rect };
    $("selbar").hidden = false;
    render();
  }
  function unselect() { S.sel = null; $("selbar").hidden = true; render(); }

  function maskRect(p, rect) {
    const item = { kind: "rect", x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    p.strokes.push(item);
    history.push({ type: "add", page: p, item });
  }

  // Transforme le texte sélectionné en un motif : une date, une forme de numéro, ou le mot lui-même.
  function motifDe(texte) {
    const t = texte.trim();
    const d = DATE_RE();
    if (d.test(t)) return { kind: "regle", sg: "date", pl: "dates", fem: true, regle: { id: "sel-date", type: "DATE", re: DATE_RE() } };
    if (/\d/.test(t)) {
      // Forme simple et lisible : chaque chiffre devient 9 (« 2026-4471 » donne « 9999-9999 »).
      const forme = t.replace(/\d/g, "9").replace(/\s+/g, " ");
      if (FORME_OK.test(forme)) return { kind: "regle", sg: "élément de même forme", pl: "éléments de même forme", fem: false, regle: formeVersRegle(forme) };
    }
    return { kind: "terme", sg: "occurrence", pl: "occurrences", fem: true, terme: t };
  }

  $("selMask").addEventListener("click", () => {
    if (!S.sel) return;
    maskRect(S.sel.page, S.sel.rect);
    S.sel = null; $("selbar").hidden = true;
    afterEdit();
  });
  $("selCancel").addEventListener("click", unselect);
  $("selbar").addEventListener("pointerdown", (e) => e.stopPropagation()); // les boutons ne dessinent pas
  $("selAll").addEventListener("click", async () => {
    if (!S.sel || busy) return;
    const { page: p, rect } = S.sel;
    S.sel = null; $("selbar").hidden = true;
    try {
      setStatus("Lecture du texte…", true);
      await ocr(p);
    } catch (e) { setStatus("La lecture du texte a échoué : la zone a été masquée seule."); maskRect(p, rect); afterEdit(); return; }
    const dedans = [];
    p.lines.forEach((l) => l.words.forEach((w) => {
      const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2;
      if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) dedans.push(w.text);
    }));
    if (!dedans.length) { maskRect(p, rect); afterEdit(); setStatus("Aucun texte lu dans cette zone : elle a été masquée seule."); return; }
    const texte = dedans.join(" ").replace(/[,;:]+$/, "");
    const m = motifDe(texte);
    let type;
    if (m.kind === "regle") { S.extra.push(m.regle); type = m.regle.type; }
    else {
      const champ = $("tOther");
      champ.value = champ.value.trim() ? champ.value.trim() + ", " + m.terme : m.terme;
      type = "DONNEE";
    }
    S.tokens = new Map(); S.counters = {};
    await detectPages(S.pages, () => {
      const n = S.pages.reduce((s, q) => s + q.boxes.filter((b) => b.active && b.token.startsWith("[" + type + "_")).length, 0);
      if (!n) { maskRect(p, rect); afterEdit(); return "Rien de semblable trouvé : la zone a été masquée seule."; }
      return `${n} ${n > 1 ? m.pl : m.sg} masqué${m.fem ? "e" : ""}${n > 1 ? "s" : ""} sur tout le document (« ${texte} »). Touchez une zone pour la démasquer.`;
    });
  });

  /* --------------------------------------------- lecture (OCR) et détection */
  let workerP = null;
  function getWorker() {
    if (!workerP) {
      workerP = Tesseract.createWorker("fra", 1, {
        workerPath: abs("vendor/tesseract/worker.min.js"),
        corePath: abs("vendor/tesseract/core"),
        langPath: abs("vendor/tesseract/lang"),
        workerBlobURL: false,
        cacheMethod: "none",
        logger: (m) => {
          if (m.status === "recognizing text") setStatus(`Lecture du texte… ${Math.round(m.progress * 100)} %`, true);
          else if (m.status && m.progress < 1) setStatus("Préparation du moteur de lecture…", true);
        },
      }).catch((e) => { workerP = null; throw e; });
    }
    return workerP;
  }

  function linesOf(data) {
    if (data.lines && data.lines.length) return data.lines;
    const out = [];
    (data.blocks || []).forEach((bl) => (bl.paragraphs || []).forEach((pa) => (pa.lines || []).forEach((l) => out.push(l))));
    return out;
  }

  // Copie nettoyée pour la lecture : niveaux de gris et contraste renforcé, même taille que l'image.
  // Une photo prise sur une table se lit ainsi beaucoup mieux.
  function pourLecture(src) {
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const x = c.getContext("2d");
    x.drawImage(src, 0, 0);
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; hist[g]++; }
    const total = d.length / 4;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < total * 0.01) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < total * 0.05) hi--;
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = v; }
    x.putImageData(im, 0, 0);
    return c;
  }

  async function ocr(p) {
    if (p.lines) return;
    const w = await getWorker();
    const { data } = await w.recognize(pourLecture(p.img));
    p.lines = linesOf(data).map((l) => ({ words: (l.words || []).filter((x) => x.text && x.text.trim()).map((x) => ({ text: x.text, bbox: x.bbox, conf: x.confidence })) }));
  }

  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const isWordChar = (c) => !!c && /[a-z0-9]/i.test(c);

  function userTerms() {
    const out = [];
    const add = (field, type, splitWords) => $(field).value.split(",").map((s) => s.trim()).filter((s) => s.length > 1).forEach((t) => {
      const key = type + "|" + norm(t);
      out.push({ type, value: t, key });
      if (splitWords) t.split(/\s+/).filter((w) => w.length >= 3).forEach((w) => out.push({ type, value: t, key, needle: w }));
    });
    add("tNames", "PERSONNE", true); add("tAddr", "ADRESSE", false); add("tOther", "DONNEE", false);
    return out.sort((a, b) => (b.needle || b.value).length - (a.needle || a.value).length);
  }

  function tokenFor(key, type, value) {
    if (!S.tokens.has(key)) {
      S.counters[type] = (S.counters[type] || 0) + 1;
      S.tokens.set(key, { token: `[${type}_${S.counters[type]}]`, type, value });
    }
    return S.tokens.get(key).token;
  }

  function detect(p) {
    const terms = userTerms();
    const previous = new Map(p.boxes.map((b) => [b.key + "@" + b.x + "," + b.y, b.active]));
    p.boxes = [];
    for (const line of p.lines) {
      const words = line.words;
      if (!words.length) continue;
      let raw = "", nrm = "";
      const rr = [], nr = [];
      words.forEach((w, i) => {
        if (i) { raw += " "; nrm += " "; }
        rr.push([raw.length, raw.length + w.text.length]); raw += w.text;
        const n = norm(w.text);
        nr.push([nrm.length, nrm.length + n.length]); nrm += n;
      });
      const used = new Set();
      const take = (ranges, s, e, type, value, key, flag) => {
        const idx = [];
        ranges.forEach(([a, b], i) => { if (a < e && b > s) idx.push(i); });
        if (!idx.length || idx.some((i) => used.has(i))) return;
        idx.forEach((i) => used.add(i));
        // Un rectangle par mot, collé au haut et au bas des lettres : il suit la ligne même si la photo est penchée.
        const bb = idx.map((i) => words[i].bbox);
        const hMax = Math.max(...bb.map((b) => b.y1 - b.y0));
        const pad = Math.max(3, Math.round(hMax * 0.15));
        const rects = bb.map((b) => ({ x: b.x0 - pad, y: b.y0 - pad, w: b.x1 - b.x0 + 2 * pad, h: b.y1 - b.y0 + 2 * pad }));
        const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
        const x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
        const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rects, key, token: tokenFor(key, type, value), words: idx.map((i) => words[i]), active: true, flag };
        const was = previous.get(key + "@" + box.x + "," + box.y);
        if (was === false) box.active = false;
        p.boxes.push(box);
      };
      for (const r of rules().concat(S.extra)) {
        r.re.lastIndex = 0;
        let m;
        while ((m = r.re.exec(raw))) {
          const v = m[0].trim();
          const bad = r.check && !r.check(v);
          if (bad && r.silent) continue; // faux positif connu : on ignore
          take(rr, m.index, m.index + m[0].length, r.type, v, r.type + "|" + v.replace(/[\s.]/g, "").toLowerCase(), bad ? "à relire" : null);
        }
      }
      // Valeurs qui suivent une étiquette de formulaire (« Nom : », « Né le »…), voir rules/etiquettes.js
      for (const v of K.valeursApresEtiquettes(raw)) {
        take(rr, v.debut, v.fin, v.etiquette.type, v.valeur, v.etiquette.type + "|" + norm(v.valeur));
      }
      for (const t of terms) {
        const needle = norm(t.needle || t.value);
        let from = 0, k;
        while ((k = nrm.indexOf(needle, from)) > -1) {
          from = k + 1;
          if (isWordChar(nrm[k - 1]) || isWordChar(nrm[k + needle.length])) continue;
          take(nr, k, k + needle.length, t.type, t.value, t.key);
        }
      }
    }
  }

  async function detectPages(list, message) {
    if (busy) return;
    busy = true; $("detect").disabled = true;
    setStatus("Lecture du texte… (jusqu'à une minute la première fois)", true);
    try {
      for (let i = 0; i < list.length; i++) {
        if (!S.pages.includes(list[i])) continue;
        if (list.length > 1) setStatus(`Lecture de la page ${S.pages.indexOf(list[i]) + 1}…`);
        await ocr(list[i]);
        detect(list[i]);
      }
      changed(); render();
      const n = S.pages.reduce((s, p) => s + p.boxes.filter((b) => b.active).length, 0);
      const flagged = S.pages.reduce((s, p) => s + p.boxes.filter((b) => b.flag).length, 0);
      if (message) setStatus(message()); else setStatus(n ? `${n} zone${n > 1 ? "s" : ""} masquée${n > 1 ? "s" : ""} automatiquement.${flagged ? ` ${flagged} à relire (encadrée en orange).` : ""} Relisez et complétez au doigt.`
                  : (S.mode === "quick"
                      ? "Rien trouvé automatiquement. Pour les noms, écrivez-les dans « Réglages », ou effacez-les au doigt."
                      : "Rien trouvé automatiquement. Effacez au doigt ce que vous voulez cacher."));
    } catch (e) {
      setStatus("La lecture du texte a échoué (" + ((e && (e.message || e)) + "").slice(0, 120) + "). Effacez au doigt, ou réessayez.");
    } finally {
      busy = false; $("detect").disabled = !S.pages.length;
      updateUI();
    }
  }
  $("detect").addEventListener("click", () => {
    const list = S.mode === "quick" ? [page()] : S.pages;
    detectPages(list.filter(Boolean));
  });
  ["tNames", "tAddr", "tOther"].forEach((id) => $(id).addEventListener("change", () => {
    if (!S.pages.length) return;
    S.tokens = new Map(); S.counters = {};
    detectPages(S.pages); // relit si besoin, puis masque les nouveaux termes partout
  }));

  function renderLegend() {
    const used = new Set();
    S.pages.forEach((p) => p.boxes.forEach((b) => { if (b.active) used.add(b.token); }));
    const rows = [...S.tokens.values()].filter((t) => used.has(t.token)).map((t) => `${t.token} = ${t.value}`);
    $("legend").hidden = !rows.length || !$("optMask").checked;
    $("legend").textContent = rows.length ? "Légende (affichée ici seulement, jamais exportée)\n" + rows.join("\n") : "";
  }
  $("optMask").addEventListener("change", () => { changed(); renderLegend(); });

  /* ------------------------------------------------------------- export */
  function finalCanvas(p, masked) {
    const c = document.createElement("canvas");
    c.width = p.img.width; c.height = p.img.height;
    paint(c.getContext("2d"), p, masked, true);
    return c;
  }

  // Image allégée : plus petite, en niveaux de gris, contraste renforcé.
  function lighten(src) {
    const k = Math.min(1, LIGHT_DIM / Math.max(src.width, src.height));
    const c = document.createElement("canvas");
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, c.width, c.height);
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      d[i] = g; hist[g]++;
    }
    const total = d.length / 4;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < total * 0.02) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < total * 0.02) hi--;
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    x.putImageData(im, 0, 0);
    return c;
  }

  const blobOf = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export"))), type, q));
  function stamp() {
    const d = new Date(), z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
  }

  function strokeMask(p) {
    const k = 0.25, c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(p.img.width * k)); c.height = Math.max(1, Math.round(p.img.height * k));
    const x = c.getContext("2d");
    x.scale(k, k);
    p.strokes.forEach((st) => strokePath(x, st));
    const data = x.getImageData(0, 0, c.width, c.height).data;
    return (px, py) => {
      const ix = Math.round(px * k), iy = Math.round(py * k);
      if (ix < 0 || iy < 0 || ix >= c.width || iy >= c.height) return false;
      return data[(iy * c.width + ix) * 4 + 3] > 0;
    };
  }

  async function buildText(masked) {
    for (let i = 0; i < S.pages.length; i++) {
      if (!S.pages[i].lines) { setStatus(`Lecture de la page ${i + 1}…`); await ocr(S.pages[i]); }
    }
    return S.pages.map((p, pi) => {
      const hit = masked ? strokeMask(p) : () => false;
      const out = S.pages.length > 1 ? [`--- Page ${pi + 1} ---`] : [];
      for (const line of p.lines) {
        const parts = [], done = new Set();
        for (const w of line.words) {
          const b = masked && p.boxes.find((bx) => bx.active && bx.words.includes(w));
          if (b) { if (!done.has(b)) { parts.push(b.token); done.add(b); } continue; }
          const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2;
          if (hit(cx, cy)) { if (parts[parts.length - 1] !== "[MASQUÉ]") parts.push("[MASQUÉ]"); continue; }
          parts.push(w.text);
        }
        if (parts.length) out.push(parts.join(" "));
      }
      return out.join("\n");
    }).join("\n\n");
  }

  async function buildOutput() {
    const f = fmt(), masked = $("optMask").checked, base = "kerckhoffs-" + stamp();
    if (f === "text") {
      const text = await buildText(masked);
      return { text, files: [new File([text], base + ".txt", { type: "text/plain" })] };
    }
    if (f === "pdf") {
      const { jsPDF } = window.jspdf;
      let doc = null;
      for (const p of S.pages) {
        const c = finalCanvas(p, masked);
        const o = c.width > c.height ? "l" : "p";
        if (!doc) doc = new jsPDF({ orientation: o, unit: "px", format: [c.width, c.height], hotfixes: ["px_scaling"], compress: true });
        else doc.addPage([c.width, c.height], o);
        doc.addImage(c.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, c.width, c.height);
      }
      doc.setProperties({ title: "Document", author: "", subject: "", keywords: "", creator: "" });
      return { files: [new File([doc.output("blob")], base + ".pdf", { type: "application/pdf" })] };
    }
    const files = [];
    for (let i = 0; i < S.pages.length; i++) {
      let c = finalCanvas(S.pages[i], masked);
      if (f === "light") c = lighten(c);
      const b = await blobOf(c, "image/jpeg", f === "light" ? 0.72 : 0.9);
      files.push(new File([b], `${base}${S.pages.length > 1 ? "-p" + (i + 1) : ""}.jpg`, { type: "image/jpeg" }));
    }
    return { files };
  }

  async function prepared() {
    const key = S.version + "|" + fmt() + "|" + $("optMask").checked;
    if (S.cache && S.cache.key === key) return S.cache.out;
    setStatus("Préparation…");
    const out = await buildOutput();
    S.cache = { key, out };
    return out;
  }
  const sizeOf = (out) => out.files.reduce((s, f) => s + f.size, 0);
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " Mo" : Math.max(1, Math.round(n / 1024)) + " ko");

  function save(out) {
    out.files.forEach((f, i) => setTimeout(() => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f); a.download = f.name;
      document.body.append(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }, i * 400));
    setStatus(`Enregistré (${kb(sizeOf(out))}). Pensez à supprimer le fichier quand vous n'en avez plus besoin.`);
  }

  async function doSave() {
    try { save(await prepared()); } catch (e) { setStatus("L'export a échoué. Réessayez."); }
  }
  $("btnSave").addEventListener("click", () => { closeSheet(); avecCerbere(doSave); });

  async function doShare() {
    let out;
    try { out = await prepared(); } catch (e) { setStatus("L'export a échoué. Réessayez."); return; }
    const data = fmt() === "text" ? { text: out.text } : { files: out.files };
    if (!navigator.share || (data.files && navigator.canShare && !navigator.canShare(data))) {
      save(out);
      setStatus("Le partage n'est pas disponible ici : le fichier a été enregistré.");
      return;
    }
    try {
      await navigator.share(data);
      setStatus(`Partagé (${kb(sizeOf(out))}).`);
    } catch (e) {
      if (e.name === "AbortError") setStatus("");
      else setStatus("C'est prêt. Touchez encore « Partager ».");
    }
  }
  $("btnShare").addEventListener("click", () => avecCerbere(doShare));

  async function doCopy() {
    try {
      if (fmt() === "text") {
        const out = await prepared();
        await navigator.clipboard.writeText(out.text);
        setStatus("Texte copié. Collez-le dans l'IA.");
        return;
      }
      // Une image : la page affichée. Le presse-papiers n'accepte que le PNG.
      const p = page(), f = fmt(), masked = $("optMask").checked;
      const make = async () => {
        let c = finalCanvas(p, masked);
        if (f === "light") c = lighten(c);
        return blobOf(c, "image/png");
      };
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": make() })]);
      } catch (e1) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": await make() })]);
      }
      setStatus((f === "pdf" ? "Un PDF ne se copie pas : l'image de la page affichée a été copiée. " : "Image copiée. ") + "Collez-la dans l'IA.");
    } catch (e) {
      setStatus("La copie n'est pas autorisée ici. Utilisez « Partager » ou « Enregistrer ».");
    }
  }
  $("btnCopy").addEventListener("click", () => avecCerbere(doCopy));

  /* ------------------ profil : les mots appris, gardés dans un QR code chiffré que VOUS conservez */
  // Le profil ne contient que des listes de mots et des formes simples (ex. « 99-999 »), jamais de code ni de document.
  const PROFIL_PREFIXE = "KERCKHOFFS:1:";
  const LIMITES = { mots: 150, longueur: 80, formes: 30 };
  let profilSnapshot = "";       // contenu du profil au dernier enregistrement ou ouverture
  let profilEnAttente = null;    // texte du QR code lu, en attente de la phrase de passe
  let profilLu = null;           // profil déchiffré, en attente de confirmation

  const liste = (id) => $(id).value.split(",").map((s) => s.trim()).filter(Boolean);
  function profilActuel() {
    return {
      v: 1,
      noms: liste("tNames"), adresses: liste("tAddr"), autres: liste("tOther"),
      formes: S.extra.filter((r) => r.forme).map((r) => r.forme),
      dates: S.extra.some((r) => r.id === "sel-date"),
    };
  }
  const profilVide = (p) => !p.noms.length && !p.adresses.length && !p.autres.length && !p.formes.length && !p.dates;
  const profilModifie = () => { const p = profilActuel(); return !profilVide(p) && JSON.stringify(p) !== profilSnapshot; };

  // Contrôle strict : tout ce qui ne correspond pas exactement au format attendu est refusé.
  const FORME_OK = /^[A-Za-zÀ-ÿ0-9 .\-\/:'’]{2,40}$/;
  function validerProfil(o) {
    if (!o || typeof o !== "object" || Array.isArray(o) || o.v !== 1) return null;
    const cles = ["v", "noms", "adresses", "autres", "formes", "dates"];
    if (Object.keys(o).some((k) => !cles.includes(k))) return null;
    const mots = (a) => Array.isArray(a) && a.length <= LIMITES.mots &&
      a.every((s) => typeof s === "string" && s.length >= 1 && s.length <= LIMITES.longueur && !/[\u0000-\u001f<>]/.test(s));
    if (!mots(o.noms) || !mots(o.adresses) || !mots(o.autres)) return null;
    if (!Array.isArray(o.formes) || o.formes.length > LIMITES.formes || !o.formes.every((f) => typeof f === "string" && FORME_OK.test(f))) return null;
    if (typeof o.dates !== "boolean") return null;
    return o;
  }

  function appliquerProfil(o) {
    const fusion = (id, a) => { const v = liste(id); a.forEach((x) => { if (!v.includes(x)) v.push(x); }); $(id).value = v.join(", "); };
    fusion("tNames", o.noms); fusion("tAddr", o.adresses); fusion("tOther", o.autres);
    o.formes.forEach((f) => { if (!S.extra.some((r) => r.forme === f)) S.extra.push(formeVersRegle(f)); });
    if (o.dates && !S.extra.some((r) => r.id === "sel-date")) S.extra.push({ id: "sel-date", type: "DATE", re: DATE_RE() });
    profilSnapshot = JSON.stringify(profilActuel());
    if (S.pages.length) { S.tokens = new Map(); S.counters = {}; detectPages(S.pages); }
    majProfilStatut();
  }

  // Chiffrement : PBKDF2 (310 000 tours) + AES-GCM 256. Toute modification du QR code est détectée et refusée.
  const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  async function cle(pass, sel) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sel, iterations: 310000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function chiffrerProfil(o, pass) {
    const sel = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cle(pass, sel), new TextEncoder().encode(JSON.stringify(o))));
    const tout = new Uint8Array(sel.length + iv.length + ct.length);
    tout.set(sel); tout.set(iv, 16); tout.set(ct, 28);
    return PROFIL_PREFIXE + b64u(tout);
  }
  async function dechiffrerProfil(texte, pass) {
    const d = unb64u(texte.slice(PROFIL_PREFIXE.length));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: d.slice(16, 28) }, await cle(pass, d.slice(0, 16)), d.slice(28));
    return validerProfil(JSON.parse(new TextDecoder().decode(pt)));
  }
  async function empreinte(o) {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(o))));
    const x = [...h.slice(0, 3)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    return x.slice(0, 2) + "-" + x.slice(2);
  }
  const resume = (o) => {
    const n = o.noms.length + o.adresses.length + o.autres.length;
    const parts = [`${n} mot${n > 1 ? "s" : ""} ou nom${n > 1 ? "s" : ""}`];
    if (o.formes.length) parts.push(`${o.formes.length} forme${o.formes.length > 1 ? "s" : ""} de numéro`);
    if (o.dates) parts.push("toutes les dates");
    return parts.join(", ");
  };

  // Dessin du QR code, avec une légende sans aucune donnée personnelle.
  function dessinerQR(texte, legende) {
    let qr = null;
    for (const niveau of ["M", "L"]) {
      try { qr = qrcode(0, niveau); qr.addData(texte, "Byte"); qr.make(); break; } catch (e) { qr = null; }
    }
    if (!qr) return null;
    const n = qr.getModuleCount(), cell = Math.max(4, Math.floor(720 / (n + 8))), marge = cell * 4, bas = 70;
    const c = document.createElement("canvas");
    c.width = n * cell + marge * 2; c.height = n * cell + marge * 2 + bas;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) x.fillRect(marge + k * cell, marge + r * cell, cell, cell);
    x.fillStyle = "#002366"; x.font = "600 24px system-ui, sans-serif"; x.textAlign = "center";
    x.fillText(legende, c.width / 2, c.height - bas / 2);
    return c;
  }

  // Lecture d'un QR code sur une image : lecteur intégré du téléphone si possible, sinon jsQR (hors ligne).
  async function lireQR(c) {
    if ("BarcodeDetector" in window) {
      try {
        const r = await new BarcodeDetector({ formats: ["qr_code"] }).detect(c);
        if (r.length) return r[0].rawValue;
      } catch (e) {}
    }
    try {
      const k = Math.min(1, 1400 / Math.max(c.width, c.height));
      const t = document.createElement("canvas");
      t.width = Math.round(c.width * k); t.height = Math.round(c.height * k);
      const x = t.getContext("2d"); x.drawImage(c, 0, 0, t.width, t.height);
      const r = jsQR(x.getImageData(0, 0, t.width, t.height).data, t.width, t.height);
      return r ? r.data : null;
    } catch (e) { return null; }
  }
  // Si l'image est un profil Kerckhoffs, on propose de l'ouvrir au lieu de l'ajouter comme page.
  async function estUnProfil(c) {
    const t = await lireQR(c);
    if (t && t.startsWith(PROFIL_PREFIXE)) { demanderOuverture(t); return true; }
    return false;
  }

  function vue(nom) {
    ["pfVueCreer", "pfVueQR", "pfVueOuvrir", "pfVueResume"].forEach((id) => { $(id).hidden = id !== nom; });
    $("pfErreur").textContent = "";
    $("profil").hidden = false;
  }
  function majProfilStatut() {
    const p = profilActuel();
    $("pfStatut").textContent = profilVide(p) ? "Aucun mot enregistré pour l'instant." : `Profil en cours : ${resume(p)}.`;
  }

  $("pfSave").addEventListener("click", () => {
    if (profilVide(profilActuel())) { setStatus("Rien à enregistrer : ajoutez d'abord des noms ou des mots à masquer."); return; }
    closeSheet(); $("pfPass").value = ""; $("pfPass2").value = ""; vue("pfVueCreer");
  });
  $("pfCreer").addEventListener("click", async () => {
    const pass = $("pfPass").value;
    if (pass.length < 12) { $("pfErreur").textContent = "Choisissez une phrase de passe d'au moins 12 caractères, par exemple quatre mots au hasard."; return; }
    if (pass !== $("pfPass2").value) { $("pfErreur").textContent = "Les deux phrases de passe ne sont pas identiques."; return; }
    const o = profilActuel();
    const texte = await chiffrerProfil(o, pass);
    const emp = await empreinte(o);
    const d = new Date(), z = (n) => String(n).padStart(2, "0");
    const c = dessinerQR(texte, `Profil Kerckhoffs · ${emp} · ${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()}`);
    if (!c) { $("pfErreur").textContent = "Le profil est trop grand pour un QR code. Retirez quelques mots."; return; }
    profilSnapshot = JSON.stringify(o);
    $("pfImage").src = c.toDataURL("image/png");
    $("pfInfo").textContent = `Empreinte ${emp} · ${resume(o)}. Enregistrez cette image : elle est illisible sans votre phrase de passe.`;
    $("pfImage").dataset.nom = `kerckhoffs-profil-${emp}.png`;
    S.qrCanvas = c;
    vue("pfVueQR");
  });
  $("pfEnregistrer").addEventListener("click", async () => {
    const b = await blobOf(S.qrCanvas, "image/png");
    save({ files: [new File([b], $("pfImage").dataset.nom, { type: "image/png" })] });
    $("pfInfo").textContent = "QR code enregistré. Rangez aussi votre phrase de passe en lieu sûr.";
  });
  $("pfPartager").addEventListener("click", async () => {
    const b = await blobOf(S.qrCanvas, "image/png");
    const f = new File([b], $("pfImage").dataset.nom, { type: "image/png" });
    try { await navigator.share({ files: [f] }); } catch (e) { if (e.name !== "AbortError") save({ files: [f] }); }
  });

  $("pfOpen").addEventListener("click", () => $("inProfil").click());
  $("inProfil").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    closeSheet();
    try {
      const im = await loadImage(f);
      if (!(await estUnProfil(toCanvas(im, im.width, im.height)))) setStatus("Aucun QR code de profil Kerckhoffs trouvé sur cette image.");
    } catch (err) { setStatus("Impossible de lire cette image."); }
  });
  function demanderOuverture(texte) {
    profilEnAttente = texte; $("pfPassOuvrir").value = ""; vue("pfVueOuvrir");
  }
  $("pfDechiffrer").addEventListener("click", async () => {
    try {
      const o = await dechiffrerProfil(profilEnAttente, $("pfPassOuvrir").value);
      if (!o) throw new Error("format");
      profilLu = o;
      $("pfResume").textContent = `Ce profil contient ${resume(o)}. Empreinte : ${await empreinte(o)}.`;
      vue("pfVueResume");
    } catch (err) {
      $("pfErreur").textContent = "Impossible d'ouvrir ce profil : phrase de passe incorrecte, ou QR code modifié.";
    }
  });
  $("pfUtiliser").addEventListener("click", () => {
    if (profilLu) appliquerProfil(profilLu);
    profilLu = null; profilEnAttente = null;
    $("profil").hidden = true;
    setStatus("Profil chargé : ses mots seront masqués sur tous vos documents.");
  });
  document.querySelectorAll(".pfFermer").forEach((b) => b.addEventListener("click", () => {
    $("profil").hidden = true; profilLu = null; profilEnAttente = null;
  }));

  // Fin de session : proposer de garder les mots appris
  $("finGarder").addEventListener("click", () => { $("finSession").hidden = true; $("pfPass").value = ""; $("pfPass2").value = ""; vue("pfVueCreer"); });
  $("finEffacer").addEventListener("click", () => { $("finSession").hidden = true; quitter(); });
  $("finRester").addEventListener("click", () => { $("finSession").hidden = true; });

  /* --------------------------- Cerbère : vérifier ce qui reste visible, avant d'envoyer */
  // Tout se passe ici, sur l'appareil. Les règles et la liste des mots sensibles sont dans rules/cerbere.js.
  let cerbereOk = -1;        // version du document déjà vérifiée par Cerbère
  let cerbereSuite = null;   // action à faire après le rapport : doShare ou doCopy
  let cerbereItems = [];

  function couvert(p) {
    const trait = strokeMask(p);
    return (x, y) => trait(x, y) || p.boxes.some((b) => b.active && (b.rects || [b]).some((r) =>
      x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h));
  }

  // Applique une liste de règles aux mots visibles d'une ligne, et renvoie les zones trouvées.
  function chercher(regles, mots) {
    if (!mots.length) return [];
    let raw = ""; const rr = [];
    mots.forEach((w, i) => { if (i) raw += " "; rr.push([raw.length, raw.length + w.text.length]); raw += w.text; });
    const out = [];
    for (const r of regles) {
      r.re.lastIndex = 0; let m;
      while ((m = r.re.exec(raw))) {
        if (!m[0].trim()) { r.re.lastIndex++; continue; }
        const v = m[0].trim();
        if (r.check && !r.check(v) && r.silent) continue;
        const s = m.index, e = m.index + m[0].length;
        const touches = mots.filter((w, i) => rr[i][0] < e && rr[i][1] > s);
        out.push({ regle: r, texte: v, mots: touches });
      }
    }
    return out;
  }

  const rectsDe = (mots) => mots.map((w) => {
    const pad = Math.max(3, Math.round((w.bbox.y1 - w.bbox.y0) * 0.15));
    return { x: w.bbox.x0 - pad, y: w.bbox.y0 - pad, w: w.bbox.x1 - w.bbox.x0 + 2 * pad, h: w.bbox.y1 - w.bbox.y0 + 2 * pad };
  });

  async function analyserCerbere() {
    const items = [];
    const sensibles = K.cerbere.sensibles.map((s) => ({ ...s, n: s.exact ? s.mot : norm(s.mot) }));
    const detection = rules().concat(S.extra, [{ id: "date", type: "DATE", re: DATE_RE() }]);
    for (const [pi, p] of S.pages.entries()) {
      await ocr(p);
      const cache = couvert(p);
      const vu = new Set();
      const ajouter = (it) => {
        const k = it.label + "|" + it.texte;
        if (vu.has(k)) { const old = items.find((x) => x.page === pi && x.label + "|" + x.texte === k); if (old) old.rects.push(...it.rects); return; }
        vu.add(k); items.push({ ...it, page: pi });
      };
      for (const line of p.lines) {
        // Mots visibles et lus avec assez d'assurance (on écarte le « bruit » de lecture, par exemple au bord des zones noires).
        const visibles = line.words.filter((w) => (w.conf == null || w.conf >= 60) && !cache((w.bbox.x0 + w.bbox.x1) / 2, (w.bbox.y0 + w.bbox.y1) / 2));
        // Tête 1 : noms probables
        chercher(K.cerbere.regles, visibles).forEach((h) => {
          const mots = h.regle.id === "nom-titre" ? h.mots.slice(1) : h.mots; // on garde la civilité visible
          if (mots.length) ajouter({ tete: 1, label: h.regle.label, texte: mots.map((w) => w.text).join(" "), rects: rectsDe(mots) });
        });
        // Tête 1 bis : valeur encore visible après une étiquette (« Nom : », « Né le »…)
        if (visibles.length) {
          let raw = ""; const rr = [];
          visibles.forEach((w, i) => { if (i) raw += " "; rr.push([raw.length, raw.length + w.text.length]); raw += w.text; });
          K.valeursApresEtiquettes(raw).forEach((v) => {
            const mots = visibles.filter((w, i) => rr[i][0] < v.fin && rr[i][1] > v.debut);
            if (mots.length) ajouter({ tete: 1, label: "Après l'étiquette « " + v.etiquette.mots[0] + " »", texte: v.valeur, rects: rectsDe(mots) });
          });
        }
        // Tête 3 : numéros, dates, adresses encore visibles
        chercher(detection, visibles).forEach((h) => ajouter({ tete: 3, label: "Encore visible : " + h.regle.type.toLowerCase(), texte: h.texte, rects: rectsDe(h.mots) }));
        // Tête 2 : mots sensibles (signalés, à laisser si l'IA en a besoin)
        // « e » garde les majuscules ; la lecture confond souvent I et l (« Al » pour « AI ») : on corrige pour les mots courts.
        const brut = (t) => { const s = t.replace(/[.,;:()«»"]/g, ""); return s.length <= 3 ? s.replace(/l/g, "I") : s; };
        const texteNorm = visibles.map((w) => ({ w, n: norm(w.text.replace(/[.,;:()«»"]/g, "")), e: brut(w.text) }));
        for (const s of sensibles) {
          const parts = s.n.split(/\s+/);
          for (let i = 0; i + parts.length <= texteNorm.length; i++) {
            const ok = parts.every((pt, j) => (s.exact ? texteNorm[i + j].e === pt : texteNorm[i + j].n === pt));
            if (ok) {
              const mots = texteNorm.slice(i, i + parts.length).map((x) => x.w);
              ajouter({ tete: 2, label: "Mot sensible", texte: s.mot, rects: rectsDe(mots), info: true });
            }
          }
        }
      }
      // Tête 3 : codes-barres et codes 2D, quand le téléphone sait les reconnaître (hors ligne)
      if ("BarcodeDetector" in window) {
        try {
          const formats = await BarcodeDetector.getSupportedFormats();
          const codes = await new BarcodeDetector({ formats }).detect(p.img);
          codes.forEach((c) => {
            const b = c.boundingBox;
            let vus = 0, total = 0;
            for (let gx = 0; gx <= 4; gx++) for (let gy = 0; gy <= 4; gy++) {
              total++; if (!cache(b.x + (b.width * gx) / 4, b.y + (b.height * gy) / 4)) vus++;
            }
            if (vus / total > 0.2) ajouter({ tete: 3, label: "Code-barres ou code 2D", texte: c.format.replace(/_/g, " "), rects: [{ x: b.x - 6, y: b.y - 6, w: b.width + 12, h: b.height + 12 }] });
          });
        } catch (e) { /* pas de lecteur de codes sur cet appareil */ }
      }
    }
    return items.sort((a, b) => a.tete - b.tete);
  }

  function afficherCerbere() {
    const ul = $("cerbereList");
    ul.textContent = "";
    const restants = cerbereItems.filter((it) => !it.fait);
    $("cerbereIntro").textContent = restants.length
      ? `Cerbère a trouvé ${restants.length} point${restants.length > 1 ? "s" : ""} à vérifier dans ce qui reste visible.`
      : "Rien à signaler. Vous pouvez envoyer.";
    $("cerbereSend").textContent = strict ? "Aperçu final" : (restants.length ? "Envoyer quand même" : "Envoyer");
    $("cerbereSend").hidden = strict && restants.length > 0; // en mode strict : tout traiter d'abord
    $("cerbereStrictNote").hidden = !(strict && restants.length > 0);
    cerbereItems.forEach((it, i) => {
      if (it.fait) return;
      const li = document.createElement("li");
      li.className = "cerbere-item";
      const t = document.createElement("button");
      t.type = "button"; t.className = "cerbere-voir";
      const l = document.createElement("strong"); l.textContent = it.label;
      const v = document.createElement("span"); v.textContent = "« " + it.texte + " »" + (S.pages.length > 1 ? ` · page ${it.page + 1}` : "");
      t.append(l, v);
      t.addEventListener("click", () => montrer(it));
      const m = document.createElement("button"); m.type = "button"; m.className = "btn small dark"; m.textContent = "Masquer";
      m.addEventListener("click", () => {
        const p = S.pages[it.page];
        it.rects.forEach((r) => maskRect(p, r));
        it.fait = true; S.flash = null; afterEdit(); afficherCerbere();
      });
      const g = document.createElement("button"); g.type = "button"; g.className = "btn small"; g.textContent = "Laisser";
      g.addEventListener("click", () => { it.fait = true; S.flash = null; render(); afficherCerbere(); });
      const act = document.createElement("div"); act.className = "cerbere-act"; act.append(m, g);
      li.append(t, act);
      ul.append(li);
    });
  }

  function montrer(it) {
    if (it.page !== S.cur) { S.cur = it.page; fitView(); updateUI(); }
    S.flash = { page: S.pages[it.page], rects: it.rects };
    render();
  }

  // Mode strict (professionnels) : chaque alerte doit être traitée, puis un aperçu final est obligatoire.
  let strict = false;
  try { strict = localStorage.getItem("kerckhoffs-strict") === "1"; } catch (e) {}
  $("optStrict").checked = strict;
  $("optStrict").addEventListener("change", () => {
    strict = $("optStrict").checked;
    try { localStorage.setItem("kerckhoffs-strict", strict ? "1" : "0"); } catch (e) {}
    cerbereOk = -1;
  });

  async function avecCerbere(action) {
    if (!$("optMask").checked || (cerbereOk === S.version && !strict)) return action();
    let attendu = false;
    if (busy) { // lecture en cours : on attend qu'elle finisse, puis Cerbère vérifie
      attendu = true;
      setStatus("Lecture du texte en cours, Cerbère vérifie juste après…", true);
      while (busy) await new Promise((r) => setTimeout(r, 300));
    }
    const direct = !attendu && S.pages.every((p) => p.lines);
    let items;
    try { setStatus("Cerbère vérifie ce qui reste visible…", true); items = await analyserCerbere(); }
    catch (e) { items = []; }
    setStatus("");
    if (!items.length && direct && !strict) {
      cerbereOk = S.version;
      await action();
      setStatus(($("status").textContent + " Cerbère n'a rien trouvé à signaler.").trim());
      return;
    }
    cerbereItems = items; cerbereSuite = action;
    closeSheet();
    $("cerbere").hidden = false; // sans voile sombre : l'image reste visible au-dessus
    afficherCerbere();
  }
  function fermerCerbere() { $("cerbere").hidden = true; $("backdrop").hidden = true; S.flash = null; render(); }
  $("cerbereBack").addEventListener("click", fermerCerbere);
  $("cerbereSend").addEventListener("click", () => {
    const suite = cerbereSuite;
    cerbereOk = S.version; fermerCerbere();
    if (strict) { ouvrirApercu(suite); return; }
    if (suite) suite(); // appelé directement dans le toucher : le partage et la copie restent autorisés
  });

  // Aperçu final (mode strict) : exactement ce qui va partir, page par page.
  let apercuSuite = null;
  function ouvrirApercu(suite) {
    apercuSuite = suite;
    const box = $("apercuPages");
    box.textContent = "";
    const masked = $("optMask").checked, f = fmt();
    S.pages.forEach((p) => {
      let c = finalCanvas(p, masked);
      if (f === "light") c = lighten(c);
      const img = document.createElement("img");
      img.src = c.toDataURL("image/jpeg", 0.8);
      img.alt = "Aperçu de la page envoyée";
      box.append(img);
    });
    $("apercuOk").checked = false;
    $("apercuSend").disabled = true;
    $("apercu").hidden = false;
  }
  $("apercuOk").addEventListener("change", () => { $("apercuSend").disabled = !$("apercuOk").checked; });
  $("apercuBack").addEventListener("click", () => { $("apercu").hidden = true; cerbereOk = -1; });
  $("apercuSend").addEventListener("click", () => {
    $("apercu").hidden = true;
    const suite = apercuSuite; apercuSuite = null;
    if (suite) suite();
  });
  $("btnCerbere").addEventListener("click", () => { cerbereOk = -1; closeSheet(); avecCerbere(() => setStatus("Cerbère : rien d'autre à signaler.")); });

  /* ------------------------------------------------------------ exemple */
  function demoPage() {
    const c = document.createElement("canvas");
    c.width = 1240; c.height = 1754;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#111";
    x.font = "bold 40px Arial, Helvetica, sans-serif";
    x.fillText("Caisse d'assurance Horizon SA", 90, 140);
    x.font = "30px Arial, Helvetica, sans-serif";
    x.fillText("Confirmation de couverture 2027", 90, 200);
    const L = [
      "Assuré : Jean Exemple",
      "Adresse : Rue du Lac 12, 1003 Lausanne",
      "N° AVS : 756.9217.0769.85",
      "N° de police : 48291736",
      "Téléphone : 021 555 12 34",
      "E-mail : jean.exemple@example.ch",
      "IBAN : CH93 0076 2011 6238 5295 7",
      "",
      "Prime mensuelle : CHF 412.30",
      "Franchise annuelle : CHF 1'500.00",
      "Début de la couverture : 1er janvier 2027",
      "",
      "Ce document est fictif.",
    ];
    L.forEach((t, i) => x.fillText(t, 90, 320 + i * 62));
    return newPage(c, "exemple.png");
  }
  $("goDemo").addEventListener("click", () => {
    openWork("folder");
    $("tNames").value = "Jean Exemple";
    $("tAddr").value = "Rue du Lac 12, 1003 Lausanne";
    const p = demoPage();
    S.pages = [p]; S.cur = 0; changed();
    closeSheet();
    updateUI();
    requestAnimationFrame(() => { fitView(); render(); });
    detectPages([p]);
  });

  $("goQuick").addEventListener("click", () => openWork("quick"));
  $("goFolder").addEventListener("click", () => openWork("folder"));

  /* ------------------------- au premier lancement de chaque version : vérifier sa version */
  const VERSION_APP = "0.4.7";
  const ADRESSE_OFFICIELLE = ""; // sera remplie, et signée par l'auteur, pour la version officielle
  (function verifierVersion() {
    $("verVersion").textContent = VERSION_APP;
    $("verOrigine").textContent = location.host || "fichier local";
    $("verOfficielle").textContent = ADRESSE_OFFICIELLE || "pas encore publiée (ceci est une version de test, non signée)";
    let vue = null;
    try { vue = localStorage.getItem("kerckhoffs-version-vue"); } catch (e) {}
    if (vue !== VERSION_APP) $("verif").hidden = false;
    $("verifOk").addEventListener("click", () => {
      $("verif").hidden = true;
      try { localStorage.setItem("kerckhoffs-version-vue", VERSION_APP); } catch (e) {}
    });
    $("openVerif").addEventListener("click", () => { $("verif").hidden = false; });
  })();

  /* ------------------------------------------------------ hors ligne et mises à jour */
  const st = $("offlineState");
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    const avaitUneVersion = !!navigator.serviceWorker.controller;
    let nouvelleVersion = false;
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // Vérifier la page officielle à l'ouverture, et à chaque retour dans l'application.
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
      return navigator.serviceWorker.ready;
    }).then(() => {
      st.textContent = "Prêt pour le mode avion"; st.classList.add("ready");
    }).catch(() => { st.textContent = "Mode hors ligne indisponible sur ce navigateur"; });
    // Une nouvelle version vient de s'installer : on propose de l'utiliser, sans jamais effacer un travail en cours.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!avaitUneVersion || nouvelleVersion) return;
      nouvelleVersion = true;
      montrerBandeau();
    });
  } else {
    st.textContent = "Ouvrez Kerckhoffs depuis son adresse web pour l'utiliser hors ligne";
  }
  function montrerBandeau() {
    const b = $("majBandeau");
    b.hidden = false;
    $("majTexte").textContent = S.pages.length
      ? "Nouvelle version disponible. Terminez d'abord votre travail : l'utiliser efface l'ardoise."
      : "Nouvelle version disponible.";
  }
  $("majOk").addEventListener("click", () => location.reload());
  $("majPlusTard").addEventListener("click", () => { $("majBandeau").hidden = true; });

  /* ---------------------------------------- installer Kerckhoffs comme une application */
  let invitation = null;
  const installee = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (installee()) $("installBloc").hidden = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); invitation = e;
    $("btnInstaller").hidden = false;
  });
  $("btnInstaller").addEventListener("click", async () => {
    if (!invitation) return;
    invitation.prompt();
    try { await invitation.userChoice; } catch (e) {}
    invitation = null; $("btnInstaller").hidden = true;
  });
  window.addEventListener("appinstalled", () => { $("installBloc").hidden = true; });
})();
