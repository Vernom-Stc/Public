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

  // Version figée (un seul fichier, sans mise à jour) : les moteurs sont inclus dans le fichier lui-même.
  const FIGE = window.KerckhoffsFige || null;
  pdfjsLib.GlobalWorkerOptions.workerSrc = FIGE ? FIGE.pdfWorker : abs("vendor/pdfjs/pdf.worker.min.js");

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

  // Un seul espace de travail : une ou plusieurs pages.
  const FORMATS = [["image", "Image"], ["pdf", "PDF"], ["light", "Image allégée"], ["text", "Texte seul"]];

  /* ------------------------------------------------------------------ état */
  const S = {
    pages: [],          // { img, name, strokes:[], boxes:[], lines:null }
    cur: 0,
    tokens: new Map(),  // clé -> { token, type, value }
    counters: {},
    view: { s: 1, tx: 0, ty: 0 },
    version: 0,         // change à chaque modification
    cache: null,        // { key, out } dernier export préparé
    extra: [],          // motifs ajoutés par « Masquer tous les pareils » (pour cette session)
    zones: [],          // zones répétées sur chaque page, en proportions de la page : { x, y, w, h } entre 0 et 1
    sel: null,          // zone sélectionnée au rectangle : { page, rect }
    leaving: false,
  };
  // Pour les tests sur l'ordinateur du développeur uniquement (jamais sur l'adresse publique).
  if (location.hostname === "localhost") window.__kerckhoffsTest = S;
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  const page = () => S.pages[S.cur];
  const changed = () => { S.version++; };
  // Ce qui recouvre les données : « auto » (papier pour un document, flou opaque pour une photo), « papier », « flou » ou « noir ».
  let styleMasque = "auto";
  try { const v = localStorage.getItem("kerckhoffs-style"); if (["auto", "papier", "flou", "noir"].includes(v)) styleMasque = v; } catch (e) {}
  let cerbereOk = -1;        // version du document déjà validée par la vérification avant envoi

  // Le message s'affiche sous l'image et, bien visible, par-dessus l'image.
  let busy = false;
  let toastTimer = null;
  // Le message du bas se ferme d'un toucher, et dès qu'on touche l'image : il ne gêne jamais le travail.
  function fermerToast() { clearTimeout(toastTimer); $("toast").hidden = true; }
  $("viewport").addEventListener("pointerdown", fermerToast, true);
  function setStatus(t, keep) {
    $("status").textContent = t || "";
    const el = $("toast");
    clearTimeout(toastTimer);
    if (!t || $("work").hidden) { el.hidden = true; return; }
    el.textContent = t; el.hidden = false;
    if (!keep && !busy) toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  /* ------------------------------------------------------------ navigation */
  function openWork() {
    wipe();
    $("home").hidden = true;
    $("work").hidden = false;
    $("inFile").multiple = true;
    $("inFile").accept = "application/pdf,image/*";
    closeSheet();
    buildFormats();
    setTool(outilBase, true);
    updateUI();
    window.scrollTo(0, 0);
  }

  function wipe() {
    S.pages = []; S.cur = 0; S.tokens = new Map(); S.counters = {}; S.cache = null; S.leaving = false; S.renomme = new Map();
    S.extra = []; S.zones = []; S.sel = null; $("selbar").hidden = true; $("zonesChip").hidden = true;
    S.balayage = []; S.appris = []; S.parSelection = new Set(); S.trouves = null; S.orange = null; if ($("trouves")) $("trouves").hidden = true;
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
      $("back").textContent = "Touchez encore : tout effacer et revenir à l'accueil";
      setTimeout(() => { S.leaving = false; $("back").textContent = "Fermer le document et revenir à l'accueil"; }, 4000);
      return;
    }
    $("back").textContent = "Fermer le document et revenir à l'accueil";
    wipe(); fermerCamera(); closeSheet();
    $("work").hidden = true;
    $("home").hidden = false;
  });

  function buildFormats() {
    const box = $("formats");
    box.textContent = "";
    FORMATS.forEach(([val, label], i) => {
      const l = document.createElement("label");
      const r = document.createElement("input");
      r.type = "radio"; r.name = "fmt"; r.value = val; r.id = "fmt-" + val; r.checked = i === 0;
      r.addEventListener("change", () => { changed(); updateUI(); });
      l.append(r, document.createTextNode(" " + label));
      box.append(l);
    });
  }
  const fmt = () => (document.querySelector('input[name="fmt"]:checked') || {}).value;

  // Le filigrane « ORIGINAL · NON MASQUÉ » reste sur l'écran tant que le document n'est pas validé (vérification avant envoi passée).
  function majFiligrane() {
    const cache = !S.pages.length || cerbereOk === S.version;
    $("tampon").hidden = cache; $("tamponNote").hidden = cache;
  }
  function updateUI() {
    const has = S.pages.length > 0;
    $("empty").hidden = has;
    majFiligrane();
    cv.hidden = !has;
    ["detect", "btnShare", "btnCopy", "btnSave", "mRect", "mChercher", "mGomme", "mRecadrer", "coinMove", "coinDoigt"].forEach((id) => { $(id).disabled = !has; });
    updateUndo();
    $("pageInfo").textContent = S.pages.length > 1 ? `page ${S.cur + 1} / ${S.pages.length}` : "";
    const pg = $("pages");
    pg.hidden = S.pages.length < 2;
    pg.textContent = "";
    S.pages.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = "Page " + (i + 1);
      b.setAttribute("aria-current", i === S.cur ? "true" : "false");
      b.addEventListener("click", () => { S.cur = i; fitView(); render(); updateUI(); majStyleChip(); });
      pg.append(b);
    });
    $("btnCopy").textContent = fmt() === "text" ? "Copier le texte" : "Copier l'image";
    $("modeChip").hidden = !MODES[tool] || !has;
    majStyleChip();
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

  // source : la photo d'origine, en pleine résolution, gardée compressée pour « Rechercher ici ».
  // k : combien de pixels d'origine pour un pixel de l'image de travail ; off : décalage dû au recadrage.
  const newPage = (img, name, source) => ({ img, name, strokes: [], boxes: [], lines: null, source: source || null, off: { x: 0, y: 0 } });
  const sourceDe = (blob, largeur, c) => (blob && largeur > c.width * 1.05 ? { blob, k: largeur / c.width } : null);

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
          added.push(newPage(c, f.name || "photo", sourceDe(f, im.width, c)));
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
    S.pages.push(...added); S.cur = S.pages.length - added.length;
    changed();
    setStatus("");
    updateUI();
    requestAnimationFrame(() => { fitView(); render(); });
    detectPages(added); // la détection démarre toute seule
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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Ce navigateur n'a pas d'accès direct à la caméra : c'est l'appareil photo du téléphone qui prend le relais.
      setStatus("Ici, c'est l'appareil photo du téléphone qui s'ouvre : cette photo pourrait être enregistrée dans votre galerie. Pensez à la supprimer ensuite.", true);
      $("inCam").click(); return;
    }
    try {
      flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, ...VIDEO }, audio: false });
      // Une fois l'accès accordé, les noms des caméras sont connus : on bascule sur l'objectif principal si besoin.
      const id = await meilleureCameraArriere();
      if (id && piste().getSettings().deviceId !== id) {
        flux.getTracks().forEach((t) => t.stop());
        flux = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id }, ...VIDEO }, audio: false });
      }
    } catch (e) {
      // Sans autorisation, l'appareil photo du téléphone ne s'ouvrirait pas non plus (il passe par le navigateur) : on propose ce qui marche.
      setStatus("L'appareil photo n'est pas autorisé. Choisissez plutôt une photo déjà prise : « Importer une image ou un PDF ». " +
        "Pour l'autoriser : Paramètres du téléphone → Applications → Chrome → Autorisations → Appareil photo.", true);
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
    let c = null, source = null;
    // Une vraie photo (meilleure netteté) si le téléphone le permet, sinon une image de la vidéo.
    // Dans les deux cas, elle reste en mémoire : rien n'est écrit sur le téléphone.
    try {
      if ("ImageCapture" in window) {
        const blob = await new ImageCapture(piste()).takePhoto();
        const im = await createImageBitmap(blob);
        c = toCanvas(im, im.width, im.height); source = sourceDe(blob, im.width, c); im.close && im.close();
      }
    } catch (e) { c = null; }
    if (!c) c = toCanvas(v, v.videoWidth, v.videoHeight);
    $("camShot").disabled = false;
    fermerCamera();
    estUnProfil(c).then((profil) => { if (!profil) addPages([newPage(c, "photo", source)]); });
  });
  $("camSysteme").addEventListener("click", () => {
    fermerCamera();
    setStatus("Appareil photo du téléphone : il peut ranger la photo dans la galerie. Pensez à la supprimer ensuite.");
    $("inCam").click();
  });
  $("camCancel").addEventListener("click", () => { fermerCamera(); if (!S.pages.length) quitter(); });
  $("camImport").addEventListener("click", () => { fermerCamera(); $("inFile").click(); });
  $("btnCam").addEventListener("click", ouvrirCamera);
  $("emptyCam").addEventListener("click", ouvrirCamera);
  $("btnFile").addEventListener("click", () => $("inFile").click());
  $("emptyFile").addEventListener("click", () => $("inFile").click());

  // Réglages gardés sur l'appareil : le style des masques, les boutons en miroir, l'appareil photo à l'ouverture.
  const lireReglage = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v === null ? defaut : v; } catch (e) { return defaut; } };
  const ecrireReglage = (cle, v) => { try { localStorage.setItem(cle, v); } catch (e) {} };
  $({ auto: "styleAuto", papier: "stylePapier", flou: "styleFlou", noir: "styleNoir" }[styleMasque]).checked = true;
  document.querySelectorAll('input[name="style"]').forEach((r) => r.addEventListener("change", () => {
    styleMasque = r.value; ecrireReglage("kerckhoffs-style", r.value); changed(); render(); majStyleChip();
  }));
  const majGaucher = () => $("work").classList.toggle("gaucher", $("optGaucher").checked);
  $("optGaucher").checked = lireReglage("kerckhoffs-gaucher", "0") === "1"; majGaucher();
  $("optGaucher").addEventListener("change", () => { ecrireReglage("kerckhoffs-gaucher", $("optGaucher").checked ? "1" : "0"); majGaucher(); });
  const estTelephone = () => matchMedia("(pointer: coarse)").matches;
  $("camDirecteBloc").hidden = !estTelephone();
  $("optCamDirecte").checked = lireReglage("kerckhoffs-camera-directe", "1") === "1";
  $("optCamDirecte").addEventListener("change", () => ecrireReglage("kerckhoffs-camera-directe", $("optCamDirecte").checked ? "1" : "0"));

  // Le menu : un panneau qui monte du bas de l'écran (sur un grand écran, il se range sur le côté)
  function openSheet() { $("sheet").hidden = false; $("backdrop").hidden = false; majPanneau(); }
  function closeSheet() { $("sheet").hidden = true; $("backdrop").hidden = true; majPanneau(); }
  // Sur un grand écran, le menu et la liste Remove Before Flight se rangent à droite : la feuille se décale pour rester visible.
  function majPanneau() {
    const large = matchMedia("(min-width: 900px)").matches;
    const ouvert = large && (!$("sheet").hidden || !$("cerbere").hidden);
    if ($("work").classList.contains("panneau") === ouvert) return;
    const v = S.view, aLaVueEntiere = !v.fit || Math.abs(v.s - v.fit) < 0.001;
    $("work").classList.toggle("panneau", ouvert);
    if (page() && aLaVueEntiere) { fitView(); render(); }
  }
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
    $("chercherIci").hidden = !page() || v.s < v.fit * 1.3;
  }
  function fitView() {
    const p = page(); if (!p) return;
    cv.width = p.img.width; cv.height = p.img.height;
    const r = $("viewport").getBoundingClientRect();
    const s = Math.min(r.width / p.img.width, r.height / p.img.height);
    S.view = { s, tx: (r.width - p.img.width * s) / 2, ty: (r.height - p.img.height * s) / 2, fit: s };
    S.view.tx0 = S.view.tx; S.view.ty0 = S.view.ty;
    applyView(); $("fit").hidden = true; $("chercherIci").hidden = true;
  }

  /* Ce qui recouvre les données : du noir, ou un « flou opaque », un aplat de la couleur moyenne de la zone.
   * Dans les deux cas, il n'y a plus rien dessous : la copie envoyée est une image neuve. */
  const lumDe = (rgb) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb || ""); return m ? 0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3] : 0; };
  function moyenne(img, r) {
    const sx = Math.max(0, Math.floor(r.x)), sy = Math.max(0, Math.floor(r.y));
    const sw = Math.max(1, Math.min(img.width - sx, Math.ceil(r.w))), sh = Math.max(1, Math.min(img.height - sy, Math.ceil(r.h)));
    const c = document.createElement("canvas"); c.width = 16; c.height = 16;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingQuality = "high";
    try { x.drawImage(img, sx, sy, sw, sh, 0, 0, 16, 16); } catch (e) { return "rgb(128,128,128)"; }
    const d = x.getImageData(0, 0, 16, 16).data; let R = 0, G = 0, B = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
    const n = d.length / 4;
    // un peu plus sombre que la moyenne : la tache se voit, même sur du papier blanc
    return `rgb(${Math.round(R / n * 0.84)},${Math.round(G / n * 0.84)},${Math.round(B / n * 0.84)})`;
  }
  const cadreDe = (st) => {
    if (st.kind === "rect") return st;
    const xs = st.pts.map((q) => q[0]), ys = st.pts.map((q) => q[1]), m = st.w / 2;
    return { x: Math.min(...xs) - m, y: Math.min(...ys) - m, w: Math.max(...xs) - Math.min(...xs) + st.w, h: Math.max(...ys) - Math.min(...ys) + st.w };
  };
  /* La couleur du papier autour d'une zone : la couleur la plus fréquente sur un anneau autour d'elle.
   * L'encre est minoritaire autour d'un mot : on retrouve le fond, qu'il soit blanc, jaune, gris, sombre (mode sombre) ou coloré (une case de tableau). */
  function papierDe(img, r) {
    const m = Math.max(4, Math.min(r.w, r.h) * 0.6);
    const X0 = Math.max(0, r.x - m), Y0 = Math.max(0, r.y - m), X1 = Math.min(img.width, r.x + r.w + m), Y1 = Math.min(img.height, r.y + r.h + m);
    const k = Math.min(1, 64 / Math.max(1, X1 - X0, Y1 - Y0));
    const W = Math.max(1, Math.round((X1 - X0) * k)), H = Math.max(1, Math.round((Y1 - Y0) * k));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true });
    try { x.drawImage(img, X0, Y0, X1 - X0, Y1 - Y0, 0, 0, W, H); } catch (e) { return "rgb(245,245,245)"; }
    const d = x.getImageData(0, 0, W, H).data;
    const ix0 = (r.x - X0) * k, iy0 = (r.y - Y0) * k, ix1 = (r.x + r.w - X0) * k, iy1 = (r.y + r.h - Y0) * k;
    const seaux = new Map();
    const ajouter = (o) => { const cle = (d[o] >> 4) * 256 + (d[o + 1] >> 4) * 16 + (d[o + 2] >> 4); const s = seaux.get(cle) || [0, 0, 0, 0]; s[0] += d[o]; s[1] += d[o + 1]; s[2] += d[o + 2]; s[3]++; seaux.set(cle, s); };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (i < ix0 || i >= ix1 || j < iy0 || j >= iy1) ajouter((j * W + i) * 4);
    if (!seaux.size) for (let i = 0; i < W * H; i++) ajouter(i * 4);
    let best = null; for (const s of seaux.values()) if (!best || s[3] > best[3]) best = s;
    return `rgb(${Math.round(best[0] / best[3])},${Math.round(best[1] / best[3])},${Math.round(best[2] / best[3])})`;
  }
  // Le style de la page : en automatique, papier pour un document (lettre, formulaire, capture d'écran), flou opaque pour une photo.
  const styleDe = (p) => (p && p.styleForce) || (styleMasque === "auto" ? (p && p.genre === "photo" ? "flou" : "papier") : styleMasque);
  // La couleur d'un masque, calculée une fois sur l'image d'origine.
  function couleurDe(o, p) {
    const s = styleDe(p);
    if (s === "noir" || !p) return "#000";
    if (o.moyImg !== p.img || o.moyStyle !== s || !o.moy) {
      const r = o.kind ? cadreDe(o) : o;
      o.moy = s === "papier" ? papierDe(p.img, o.etiq ? unionDe(o.etiq.rects.concat([r])) : r) : moyenne(p.img, r);
      o.moyImg = p.img; o.moyStyle = s;
    }
    return o.moy;
  }
  const texteSur = (fond) => (fond === "#000" || lumDe(fond) < 140 ? "#fff" : "#3d4650");

  // Un élément dessiné : un trait au doigt { kind:"line", w, pts } ou un rectangle { kind:"rect", x, y, w, h }.
  // Un trait qui a recouvert des mots lus porte aussi leurs cadres (st.etiq) : le mot entier disparaît, et son étiquette s'y inscrit.
  function strokePath(c, st, couleur) {
    c.save();
    c.fillStyle = couleur || "#000"; c.strokeStyle = couleur || "#000";
    if (st.etiq) st.etiq.rects.forEach((r) => c.fillRect(r.x, r.y, r.w, r.h));
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

  // L'étiquette (« [PERSONNE_1] ») s'inscrit dans un cadre, si elle y tient, et jamais par-dessus une autre étiquette.
  function ecrireEtiquette(c, token, r, fond, deja) {
    const fs = Math.min(r.h * 0.72, r.w / (token.length * 0.62));
    if (fs < 7) return;
    if (deja) {
      const w = Math.min(r.w, token.length * fs * 0.62), z = { x: r.x + (r.w - w) / 2, y: r.y + (r.h - fs) / 2, w, h: fs };
      if (deja.some((o) => z.x < o.x + o.w && o.x < z.x + z.w && z.y < o.y + o.h && o.y < z.y + z.h)) return;
      deja.push(z);
    }
    c.save();
    c.fillStyle = texteSur(fond); c.font = `600 ${fs}px ui-monospace, Menlo, Consolas, monospace`;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(token, r.x + r.w / 2, r.y + r.h / 2, r.w - 4);
    c.restore();
  }
  // Une zone détectée sous un rectangle tracé à la main : pas d'étiquette (le rectangle masque, sans rien dire de ce qu'il cache).
  const sousRectangle = (p, b) => p && p.strokes.some((st) => st.kind === "rect" && !st.ref &&
    b.x + b.w / 2 >= st.x && b.x + b.w / 2 <= st.x + st.w && b.y + b.h / 2 >= st.y && b.y + b.h / 2 <= st.y + st.h);
  function drawBox(c, b, final, p) {
    const rects = b.rects || [b];
    c.save();
    if (b.active) {
      const fond = couleurDe(b, p);
      c.fillStyle = fond;
      rects.forEach((r) => c.fillRect(r.x, r.y, r.w, r.h));
      const r = rects.reduce((m, x) => (x.w > m.w ? x : m), rects[0]);
      // Pas d'étiquette sous un rectangle tracé à la main, ni pour une « zone répétée » (elle n'apprendrait rien au lecteur).
      if (b.etiquettes && !sousRectangle(p, b) && !String(b.key).startsWith("ZONE|")) b.etiquettes.push([b.token, r, fond]);
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
    p.strokes.forEach((st) => strokePath(c, st, couleurDe(st, p)));
    const aEcrire = [];
    p.boxes.forEach((b) => { b.etiquettes = aEcrire; drawBox(c, b, final, p); b.etiquettes = null; });
    // Les étiquettes des mots effacés au doigt et des rectangles référencés passent en premier.
    const deja = [];
    p.strokes.forEach((st) => {
      const e = st.etiq || st.ref;
      if (!e) return;
      const token = tokenFor(e.key, e.type, e.value);
      ecrireEtiquette(c, token, st.etiq ? st.etiq.zone || unionDe(st.etiq.rects) : st, couleurDe(st, p), deja);
    });
    aEcrire.forEach(([token, r, fond]) => ecrireEtiquette(c, token, r, fond, deja));
  }
  const unionDe = (rects) => {
    const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
    return { x: x0, y: y0, w: Math.max(...rects.map((r) => r.x + r.w)) - x0, h: Math.max(...rects.map((r) => r.y + r.h)) - y0 };
  };
  function render() {
    majFiligrane();
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
      poignees(r, "#2b5fe0");
    }
    if (S.cadre && S.cadre.page === p) poignees(S.cadre.rect, "#ffffff");
    // Zones d'écriture non lues, pendant le contrôle Remove Before Flight : en orange, en pointillés.
    if (S.orange) {
      ctx.save(); ctx.setLineDash([14, 8]); ctx.lineWidth = Math.max(3, cv.width / 350); ctx.strokeStyle = "#e08a1e"; ctx.fillStyle = "rgba(224,138,30,.12)";
      S.orange.filter((o) => o.page === S.cur).forEach((o) => o.rects.forEach((r) => { ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h); }));
      ctx.restore();
    }
    // Éléments qui viennent d'être trouvés : ils scintillent quelques secondes, pour qu'on aille les vérifier.
    if (S.trouves) {
      const T = S.trouves, t = (performance.now() - T.t0) / 1000;
      const eclat = t < 6 ? 0.55 + 0.45 * Math.sin(t * 7) : 0.9;
      ctx.save();
      T.items.forEach((it, i) => {
        if (it.page !== S.cur) return;
        const courant = i === T.i;
        ctx.globalAlpha = courant ? 1 : eclat;
        ctx.lineWidth = Math.max(courant ? 6 : 4, cv.width / (courant ? 220 : 320));
        ctx.strokeStyle = courant ? "#ffd400" : "#ffc400";
        ctx.shadowColor = "#ffe066"; ctx.shadowBlur = courant ? 18 : 10;
        it.rects.forEach((r) => {
          const m = ctx.lineWidth;
          ctx.strokeRect(r.x - m, r.y - m, r.w + 2 * m, r.h + 2 * m);
          // petite étincelle au coin
          const cx = r.x + r.w + m, cy = r.y - m, a = Math.max(6, cv.width / 140) * (courant ? 1.3 : 1);
          ctx.beginPath(); ctx.moveTo(cx, cy - a); ctx.lineTo(cx + a * 0.25, cy - a * 0.25); ctx.lineTo(cx + a, cy); ctx.lineTo(cx + a * 0.25, cy + a * 0.25);
          ctx.lineTo(cx, cy + a); ctx.lineTo(cx - a * 0.25, cy + a * 0.25); ctx.lineTo(cx - a, cy); ctx.lineTo(cx - a * 0.25, cy - a * 0.25); ctx.closePath();
          ctx.fillStyle = "#ffd400"; ctx.fill();
        });
      });
      ctx.restore();
    }
  }
  // Les quatre coins d'une sélection : on les tire pour l'agrandir, on glisse l'intérieur pour la déplacer.
  function poignees(r, couleur) {
    const t = 11 / S.view.s;
    ctx.save(); ctx.lineWidth = 3 / S.view.s; ctx.fillStyle = couleur; ctx.strokeStyle = "#002366";
    for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
      ctx.beginPath(); ctx.arc(x, y, t, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  // Le doigt touche-t-il un coin, l'intérieur, ou rien ?
  function prise(r, x, y) {
    const t = 26 / S.view.s;
    const coins = [[r.x, r.y, "hg"], [r.x + r.w, r.y, "hd"], [r.x, r.y + r.h, "bg"], [r.x + r.w, r.y + r.h, "bd"]];
    const c = coins.find(([cx, cy]) => Math.hypot(x - cx, y - cy) <= t);
    if (c) return c[2];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return "milieu";
    return null;
  }

  /* ---------------------- doigt : pinceau, rectangle, gomme, zoom, retour */
  const ptrs = new Map();
  let draft = null, moved = false, downAt = null, pinch = null;
  let tool = "brush", espace = false;
  const history = []; // actions à annuler : { type:"add"|"remove"|"toggle", page, item, index }

  function toImg(cx, cy) {
    const r = $("viewport").getBoundingClientRect();
    return [(cx - r.left - S.view.tx) / S.view.s, (cy - r.top - S.view.ty) / S.view.s];
  }
  const brushW = () => (+$("brush").value / 100) * Math.max(320, Math.min(cv.width, cv.height));

  // Deux modes de base, aux coins : déplacer la feuille (la croix) ou effacer au doigt.
  // Rectangle, Gomme et Recadrer s'ouvrent depuis le menu, le temps d'un geste, puis on revient au mode de base.
  let outilBase = "brush";
  const AIDES = {
    move: "Un doigt : faire glisser la feuille. Deux doigts : zoomer. « Ajuster » revient à la vue entière.",
    brush: "Passez le doigt sur ce qui doit disparaître. Deux doigts : zoomer et déplacer.",
    crop: "Zoomez et déplacez avec deux doigts pour ne voir que la feuille, puis touchez « Garder ce qui est à l'écran ». Ou glissez en diagonale autour de la feuille.",
    rect: "Glissez en diagonale sur une zone. Puis : la masquer, retrouver tous les pareils, ou dire ce que c'est (Référencer).",
    erase: "Touchez une zone masquée pour la faire réapparaître.",
  };
  const MODES = { rect: "Rectangle", crop: "Recadrer", erase: "Gomme : touchez ce qui doit réapparaître" };
  function setTool(v, silencieux) {
    tool = v;
    if (v === "brush" || v === "move") outilBase = v;
    if (S.sel && v !== "rect") unselect();
    if (S.cadre && v !== "crop") annulerCadre();
    $("refbar").hidden = true;
    $("coinDoigt").setAttribute("aria-pressed", String(v === "brush"));
    $("coinMove").setAttribute("aria-pressed", String(v === "move"));
    $("modeChip").hidden = !MODES[v] || !page();
    $("modeTexte").textContent = MODES[v] || "";
    $("cropScreen").hidden = v !== "crop" || !page();
    if (page() && !silencieux) setStatus(AIDES[v]);
  }
  const finGeste = () => setTool(outilBase, true);
  $("styleChip").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("styleChip").addEventListener("click", () => {
    const p = page(); if (!p) return;
    const suite = { papier: "flou", flou: "noir", noir: "papier" };
    p.styleForce = suite[styleDe(p)];
    changed(); render(); majStyleChip();
    setStatus("Pour cette page : " + { papier: "couleur du papier", flou: "flou opaque", noir: "noir" }[p.styleForce] + ". Touchez encore pour changer.");
  });
  $("coinDoigt").addEventListener("click", () => setTool("brush"));
  $("coinMove").addEventListener("click", () => setTool("move"));
  $("modeFin").addEventListener("click", () => setTool(outilBase));
  $("modeChip").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("mRect").addEventListener("click", () => { closeSheet(); setTool("rect"); });
  $("mGomme").addEventListener("click", () => { closeSheet(); setTool("erase"); });
  $("mRecadrer").addEventListener("click", () => { closeSheet(); setTool("crop"); });
  $("mChercher").addEventListener("click", () => { closeSheet(); chercherIci(); });
  ["undo", "coinMove", "coinDoigt", "btnOpts", "pages", "empty"].forEach((id) => $(id).addEventListener("pointerdown", (e) => e.stopPropagation()));

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

  function toggleBox(p, b) {
    b.active = !b.active; history.push({ type: "toggle", page: p, item: b });
    setStatus(b.active ? "Masqué de nouveau." : `Rendu visible. Il avait été masqué par ${b.source || "la détection"}. Touchez-le encore pour le masquer.`, true);
  }
  function eraseAt(p, x, y) {
    const i = hitItem(p, x, y);
    if (i >= 0) { const [it] = p.strokes.splice(i, 1); history.push({ type: "remove", page: p, item: it, index: i }); return true; }
    const b = hitBox(p, x, y);
    if (b && b.active) { toggleBox(p, b); return true; }
    return false;
  }
  function afterEdit() { changed(); render(); renderLegend(); updateUndo(); }

  /* Le doigt : les mots qu'il recouvre disparaissent en entier, et prennent leur étiquette (NOM_1, REF_1…).
   * Le type vient de ce que Kerckhoffs sait déjà de ces mots ; sinon, c'est une donnée (DONNEE_1). */
  function etiqueterTrait(p, st) {
    if (st.kind !== "line" || !p.lines) return;
    const couvre = (x, y) => {
      if (st.pts.length === 1) return Math.hypot(x - st.pts[0][0], y - st.pts[0][1]) <= st.w / 2;
      for (let k = 1; k < st.pts.length; k++) if (distSeg(x, y, st.pts[k - 1], st.pts[k]) <= st.w / 2) return true;
      return false;
    };
    const groupes = [];
    p.lines.forEach((l) => {
      const mots = l.words.filter((w) => {
        const b = w.bbox; let n = 0;
        for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.3, 0.7]) if (couvre(b.x0 + (b.x1 - b.x0) * fx, b.y0 + (b.y1 - b.y0) * fy)) n++;
        return n >= 3;
      });
      if (mots.length) groupes.push(mots);
    });
    if (!groupes.length) return;
    const principal = groupes.reduce((m, g) => (g.length > m.length ? g : m), groupes[0]);
    const texte = principal.map((w) => w.text).join(" ").replace(/^[\s,;:.]+|[\s,;:.]+$/g, "");
    if (!texte) return;
    let type = "DONNEE", key = "DONNEE|" + norm(texte), value = texte;
    const box = p.boxes.find((b) => (b.words || []).some((w) => principal.includes(w)));
    const connu = box && [...S.tokens.values()].find((x) => x.token === box.token);
    if (box && connu) { type = connu.type; key = box.key; value = connu.value; }
    else {
      const u = userTerms().find((x) => !x.needle && K.motsACherche(x.value).some((c) => principal.some((w) => K.ressemble(w.text, c))));
      if (u) { type = u.type; key = u.key; value = u.value; }
      else if (K.formeIdentifiant(texte)) type = "REF", key = "REF|" + norm(texte);
    }
    const tous = groupes.flat();
    st.etiq = { rects: rectsDe(tous), zone: unionDe(rectsDe(principal)), key, type, value };
  }

  // Les peluches : quand on efface, l'encre des lettres tombe en petits grains, comme sous une gomme.
  function peluches(p, st) {
    if (!animOn || reduireMouvements()) return;
    const fx = $("fx"), r = vp.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    fx.width = Math.round(r.width * dpr); fx.height = Math.round(r.height * dpr);
    const x = fx.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const z0 = cadreDe(st), zone = st.etiq ? unionDe(st.etiq.rects.concat([z0])) : z0;
    const k = Math.min(1, 140 / Math.max(zone.w, zone.h, 1));
    const W = Math.max(1, Math.round(zone.w * k)), H = Math.max(1, Math.round(zone.h * k));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const cx = c.getContext("2d", { willReadFrequently: true });
    try { cx.drawImage(p.img, zone.x, zone.y, zone.w, zone.h, 0, 0, W, H); } catch (e) { return; }
    const d = cx.getImageData(0, 0, W, H).data, grains = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const o = (j * W + i) * 4;
      if (d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114 < 150 && Math.random() < 0.7)
        grains.push({ x: zone.x + (i + 0.5) / k, y: zone.y + (j + 0.5) / k, c: `rgb(${d[o]},${d[o + 1]},${d[o + 2]})`, vx: (Math.random() - 0.5) * 70, vy: -Math.random() * 70, t0: Math.random() * 0.12 });
    }
    st.pts.forEach((q, i) => { if (i % 2 === 0) grains.push({ x: q[0], y: q[1], c: "rgba(120,110,120,.95)", vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 60, t0: Math.random() * 0.1, miette: true }); });
    if (!grains.length) return;
    const s = S.view.s, tx = S.view.tx, ty = S.view.ty, taille = Math.max(1.5, (s / k) * 0.9), duree = 0.8;
    let t0 = null;
    const pas = (ts) => {
      if (t0 === null) t0 = ts;
      const t = (ts - t0) / 1000;
      x.clearRect(0, 0, r.width, r.height);
      if (t >= duree) return;
      x.globalAlpha = Math.max(0, 1 - Math.max(0, t - 0.35) / (duree - 0.35));
      for (const g of grains) {
        const dt = Math.max(0, t - g.t0);
        x.fillStyle = g.c;
        const tl = g.miette ? Math.max(3, taille * 2.2) : taille;
        x.fillRect(tx + g.x * s + g.vx * dt, ty + g.y * s + g.vy * dt + 0.5 * 1100 * dt * dt, tl, tl);
      }
      requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  }
  function updateUndo() { if (S.rbfUn) return; $("undo").disabled = !history.some((h) => S.pages.includes(h.page)); }

  const vp = $("viewport");
  vp.addEventListener("pointerdown", (e) => {
    if (!page()) return;
    vp.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) {
      downAt = [e.clientX, e.clientY]; moved = false;
      const pt = toImg(e.clientX, e.clientY);
      const deplacer = tool === "move" || espace || (e.pointerType === "mouse" && (e.button === 1 || e.button === 2));
      if (tool === "rect" && S.sel && S.sel.page === page() && !prise(S.sel.rect, pt[0], pt[1]) && !deplacer) {
        // Un nouveau rectangle commence alors que le précédent attendait un choix : le précédent est masqué, pas perdu.
        maskRect(S.sel.page, S.sel.rect); S.sel = null; $("selbar").hidden = true; $("selColonne").hidden = true; afterEdit();
      }
      if (deplacer) draft = { kind: "pan", pt, tx0: S.view.tx, ty0: S.view.ty, force: tool !== "move" };
      else if (tool === "brush") draft = { kind: "line", w: brushW(), pts: [pt] };
      else if (tool === "rect" || tool === "crop") {
        const cible = tool === "rect" ? (S.sel && S.sel.page === page() ? S.sel : null) : (S.cadre && S.cadre.page === page() ? S.cadre : null);
        const ou = cible ? prise(cible.rect, pt[0], pt[1]) : null;
        if (ou) draft = { kind: "ajuster", cible, ou, pt0: pt, r0: { ...cible.rect } };
        else draft = { kind: tool, x0: pt[0], y0: pt[1], x: pt[0], y: pt[1], w: 0, h: 0 };
      }
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
    } else if (draft.kind === "ajuster") {
      const { r0, ou } = draft, dx = pt[0] - draft.pt0[0], dy = pt[1] - draft.pt0[1], r = draft.cible.rect;
      if (ou === "milieu") { r.x = r0.x + dx; r.y = r0.y + dy; }
      else {
        let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
        if (ou[1] === "g") x0 += dx; else x1 += dx;
        if (ou[0] === "h") y0 += dy; else y1 += dy;
        r.x = Math.min(x0, x1); r.y = Math.min(y0, y1); r.w = Math.max(4, Math.abs(x1 - x0)); r.h = Math.max(4, Math.abs(y1 - y0));
      }
      render();
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
    if (d.kind === "ajuster") { render(); return; } // la sélection reste, à sa nouvelle place
    if (d.kind === "pan") {
      if (!moved && !d.force) { const hit = hitBox(p, d.pt[0], d.pt[1]); if (hit) { toggleBox(p, hit); afterEdit(); } }
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
    if (d.kind === "rect") { select(p, aimanter(p, { x: d.x, y: d.y, w: d.w, h: d.h })); return; }
    const item = d;
    etiqueterTrait(p, item);
    p.strokes.push(item);
    history.push({ type: "add", page: p, item });
    afterEdit();
    peluches(p, item);
  }
  vp.addEventListener("contextmenu", (e) => e.preventDefault()); // le bouton droit déplace la feuille
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
    if (S.rbfUn) { retourListe(); return; }
    while (history.length) {
      const h = history.pop();
      if (!S.pages.includes(h.page)) continue;
      if (h.type === "add") { const i = h.page.strokes.indexOf(h.item); if (i >= 0) h.page.strokes.splice(i, 1); }
      else if (h.type === "remove") h.page.strokes.splice(Math.min(h.index, h.page.strokes.length), 0, h.item);
      else if (h.type === "toggle") h.item.active = !h.item.active;
      else if (h.type === "resize") Object.assign(h.item, h.avant, { moy: null });
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
  $("cropCancel").addEventListener("click", () => { annulerCadre(); finGeste(); });
  $("cropbar").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("cropOk").addEventListener("click", () => {
    if (!S.cadre) return;
    const p = S.cadre.page, r = S.cadre.rect;
    const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
    const w = Math.min(p.img.width - x, Math.round(r.w)), h = Math.min(p.img.height - y, Math.round(r.h));
    if (w < 20 || h < 20) { annulerCadre(); return; }
    const avant = { img: p.img, strokes: p.strokes, lines: p.lines, boxes: p.boxes, off: p.off };
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(p.img, -x, -y);
    // Les traits déjà faits suivent le recadrage ; la lecture du texte est refaite sur la nouvelle image.
    p.strokes = p.strokes.map((st) => st.kind === "rect" ? { ...st, x: st.x - x, y: st.y - y } : { ...st, pts: st.pts.map(([px, py]) => [px - x, py - y]) });
    p.img = c; p.lines = null; p.boxes = []; p.off = { x: p.off.x + x, y: p.off.y + y };
    history.push({ type: "crop", page: p, avant });
    S.cadre = null; $("cropbar").hidden = true;
    fitView(); changed(); render();
    finGeste();
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

  // Le même numéro, quels que soient les espaces, points ou tirets : « 12345678 » trouve aussi « 12 345 678 ».
  function numeroVersRegle(chiffres) {
    const re = new RegExp("(?<![0-9])" + chiffres.split("").join("[\\s.\\-/]{0,2}") + "(?![0-9])", "g");
    return { id: "numero-" + chiffres, type: "MOTIF", re, numero: chiffres };
  }

  function select(p, rect) {
    S.sel = { page: p, rect };
    $("selbar").hidden = false; $("refbar").hidden = true;
    // Un rectangle haut et étroit, collé aux traits d'une colonne : on propose de masquer toute la colonne, sauf son en-tête.
    $("selColonne").hidden = !(rect.aimante && rect.h > p.img.height * 0.12 && colonneEntiere(p, rect));
    render();
  }
  function unselect() { S.sel = null; $("selbar").hidden = true; $("refbar").hidden = true; $("selColonne").hidden = true; render(); }

  /* Le rectangle s'aimante aux traits d'un tableau : s'il commence à quelques pixels d'un trait de colonne ou de ligne,
   * son bord vient se coller au trait. Ainsi, rien ne dépasse entre le rectangle et le bord de la case. */
  function pixelsDe(p, x0, y0, x1, y1) {
    const X0 = Math.max(0, Math.floor(x0)), Y0 = Math.max(0, Math.floor(y0));
    const X1 = Math.min(p.img.width, Math.ceil(x1)), Y1 = Math.min(p.img.height, Math.ceil(y1));
    const W = X1 - X0, H = Y1 - Y0;
    if (W < 2 || H < 2 || !p.img.getContext) return null;
    const d = p.img.getContext("2d", { willReadFrequently: true }).getImageData(X0, Y0, W, H).data;
    const lum = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) lum[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0;
    return { X0, Y0, W, H, lum };
  }
  const SOMBRE = 175;
  function aimanter(p, r) {
    const tol = Math.max(6, Math.round(Math.min(p.img.width, p.img.height) * 0.012));
    const px = pixelsDe(p, r.x - tol, r.y - tol, r.x + r.w + tol, r.y + r.h + tol);
    if (!px) return r;
    const { X0, Y0, W, H, lum } = px;
    const yA = Math.max(0, Math.round(r.y - Y0)), yB = Math.min(H, Math.round(r.y + r.h - Y0));
    const xA = Math.max(0, Math.round(r.x - X0)), xB = Math.min(W, Math.round(r.x + r.w - X0));
    const colonne = (x) => { let n = 0; for (let y = yA; y < yB; y++) if (lum[y * W + x] < SOMBRE) n++; return n / Math.max(1, yB - yA); };
    const ligne = (y) => { let n = 0; for (let x = xA; x < xB; x++) if (lum[y * W + x] < SOMBRE) n++; return n / Math.max(1, xB - xA); };
    const proche = (v0, f, max) => {
      for (let dv = 0; dv <= tol; dv++) for (const v of [v0 - dv, v0 + dv]) if (v >= 0 && v < max && f(v) > 0.6) return v;
      return null;
    };
    const out = { x: r.x, y: r.y, w: r.w, h: r.h };
    const g = (r.h > 12) ? proche(Math.round(r.x - X0), colonne, W) : null;
    const dr = (r.h > 12) ? proche(Math.round(r.x + r.w - X0), colonne, W) : null;
    const hh = (r.w > 12) ? proche(Math.round(r.y - Y0), ligne, H) : null;
    const bb = (r.w > 12) ? proche(Math.round(r.y + r.h - Y0), ligne, H) : null;
    if (g != null) { const nx = X0 + g; out.w += out.x - nx; out.x = nx; }
    if (dr != null) out.w = X0 + dr + 1 - out.x;
    if (hh != null) { const ny = Y0 + hh; out.h += out.y - ny; out.y = ny; }
    if (bb != null) out.h = Y0 + bb + 1 - out.y;
    out.aimante = g != null && dr != null;
    return out;
  }
  // Toute la colonne, sauf l'en-tête : du premier trait sous l'en-tête jusqu'au dernier trait du tableau.
  function colonneEntiere(p, r) {
    const px = pixelsDe(p, r.x, 0, r.x + r.w, p.img.height);
    if (!px) return null;
    const { W, H, lum } = px;
    // Hauteur du trait vertical de gauche, autour du rectangle
    const xg = 0, sombreG = (y) => lum[y * W + xg] < SOMBRE || (W > 1 && lum[y * W + 1] < SOMBRE);
    let haut = Math.round(r.y + r.h / 2), bas = haut;
    let trou = 0;
    while (haut > 0 && trou < 4) { haut--; trou = sombreG(haut) ? 0 : trou + 1; }
    trou = 0;
    while (bas < H - 1 && trou < 4) { bas++; trou = sombreG(bas) ? 0 : trou + 1; }
    // Les traits horizontaux qui traversent la colonne
    const traits = [];
    for (let y = haut; y <= bas; y++) {
      let n = 0; for (let x = 0; x < W; x++) if (lum[y * W + x] < SOMBRE) n++;
      if (n / W > 0.7) { if (traits.length && y - traits[traits.length - 1].fin <= 2) traits[traits.length - 1].fin = y; else traits.push({ debut: y, fin: y }); }
    }
    if (traits.length < 3) return null;
    const y0 = traits[1].fin + 1, y1 = traits[traits.length - 1].debut;
    if (y1 - y0 < 20) return null;
    return { x: r.x, y: y0, w: r.w, h: y1 - y0 };
  }
  $("selColonne").addEventListener("click", () => {
    if (!S.sel) return;
    const c = colonneEntiere(S.sel.page, S.sel.rect);
    if (c) { S.sel.rect = c; $("selColonne").hidden = true; render(); setStatus("Toute la colonne est sélectionnée, sans l'en-tête. Choisissez maintenant : Masquer, ou Tous les pareils."); }
  });

  function maskRect(p, rect) {
    const item = { kind: "rect", x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    p.strokes.push(item);
    history.push({ type: "add", page: p, item });
  }

  // Transforme le texte sélectionné en un motif : une date, une forme de numéro, ou le mot lui-même.
  function motifDe(texte) {
    const t = texte.trim();
    const d = DATE_RE();
    if (d.test(t)) return { kind: "regle", sg: "date", pl: "dates", fem: true, regles: [{ id: "sel-date", type: "DATE", re: DATE_RE() }] };
    if (/\d/.test(t)) {
      // Forme simple et lisible : chaque chiffre devient 9 (« 2026-4471 » donne « 9999-9999 »).
      const forme = t.replace(/\d/g, "9").replace(/\s+/g, " ");
      const regles = [];
      if (FORME_OK.test(forme)) regles.push(formeVersRegle(forme));
      const chiffres = t.replace(/\D/g, "");
      if (chiffres.length >= 4 && chiffres.length <= 24) regles.push(numeroVersRegle(chiffres)); // le même numéro, écrit autrement
      if (regles.length) return { kind: "regle", sg: "élément semblable", pl: "éléments semblables", fem: false, regles };
    }
    return { kind: "terme", sg: "occurrence", pl: "occurrences", fem: true, terme: t };
  }

  $("selMask").addEventListener("click", () => {
    if (!S.sel) return;
    maskRect(S.sel.page, S.sel.rect);
    S.sel = null; $("selbar").hidden = true; $("selColonne").hidden = true;
    afterEdit(); finGeste();
  });
  $("selCancel").addEventListener("click", () => { unselect(); finGeste(); });
  // Référencer : dire ce que contient la zone. Elle prend une étiquette, et tous les pareils sont retrouvés avec la même.
  $("selRef").addEventListener("click", () => { if (S.sel) { $("selbar").hidden = true; $("refbar").hidden = false; } });
  $("refCancel").addEventListener("click", () => { $("refbar").hidden = true; if (S.sel) $("selbar").hidden = false; });
  $("refbar").addEventListener("pointerdown", (e) => e.stopPropagation());
  document.querySelectorAll("#refbar [data-ref]").forEach((b) => b.addEventListener("click", () => referencer(b.dataset.ref)));
  const motsDans = (p, r) => (p.lines || []).flatMap((l) => l.words).filter((w) => {
    const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2;
    return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
  });
  async function referencer(type) {
    if (!S.sel || busy) return;
    const { page: p, rect } = S.sel;
    S.sel = null; $("selbar").hidden = true; $("refbar").hidden = true; $("selColonne").hidden = true; finGeste();
    const item = { kind: "rect", x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    p.strokes.push(item); history.push({ type: "add", page: p, item }); afterEdit();
    try { setStatus("Lecture du texte…", true); await ocr(p); } catch (e) {}
    const elements = p.lines ? elementsDeSelection(p, rect) : [];
    const brut = motsDans(p, rect).map((w) => w.text).join(" ").trim();
    const valeur = (elements[0] || brut || "zone").trim();
    item.ref = { type, value: valeur, key: /\d/.test(valeur) ? type + "|" + valeur.replace(/[\s.]/g, "").toLowerCase() : type + "|" + norm(valeur) };
    for (const el of elements) {
      const m = motifDe(el);
      if (m.kind === "regle") m.regles.filter((r) => !(r.forme && /^[9 ]+$/.test(r.forme) && r.forme.replace(/ /g, "").length < 8))
        .forEach((r) => { r.type = type; r.id += "|" + type; if (!S.extra.some((x) => x.id === r.id)) S.extra.push(r); });
      else { const key = type + "|" + norm(el); S.appris = S.appris || []; if (!S.appris.some((x) => x.key === key)) S.appris.push({ type, value: el, key, ref: true }); }
    }
    const avant = instantane();
    S.tokens = new Map(); S.counters = {};
    await detectPages(S.pages, () => "");
    const items = nouveaux(avant, { page: p, rect });
    const nom = { PERSONNE: "un nom", ADRESSE: "une adresse", REF: "une référence", DONNEE: "une donnée" }[type];
    setStatus(`Zone référencée comme ${nom}.` + (items.length ? ` ${items.length} autre${items.length > 1 ? "s" : ""} trouvée${items.length > 1 ? "s" : ""}, avec la même étiquette : vérifiez avec ‹ ›.` : " Rien de pareil ailleurs."), true);
    montrerTrouves(items, true);
  }
  $("selZone").addEventListener("click", () => {
    if (!S.sel) return;
    const { page: p, rect: r } = S.sel, W = p.img.width, H = p.img.height;
    maskRect(p, r); // ici : masqué tout de suite
    S.zones.push({ x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H });
    S.sel = null; $("selbar").hidden = true; $("selColonne").hidden = true; finGeste();
    afterEdit(); majZones();
    const autres = S.pages.filter((q) => q !== p);
    if (autres.length) { S.tokens = new Map(); S.counters = {}; detectPages(S.pages); }
    setStatus("Zone retenue pour ce document : Kerckhoffs regarde au même endroit sur les autres pages et les prochaines photos.");
  });
  function majZones() {
    $("zonesInfo").textContent = S.zones.length
      ? `${S.zones.length} zone${S.zones.length > 1 ? "s" : ""} répétée${S.zones.length > 1 ? "s" : ""} sur chaque page.` : "";
    $("zonesClear").hidden = !S.zones.length;
    $("zonesChip").hidden = !S.zones.length;
    $("zonesChip").textContent = `↺ ${S.zones.length} zone${S.zones.length > 1 ? "s" : ""} répétée${S.zones.length > 1 ? "s" : ""} · Effacer`;
  }
  $("zonesChip").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("zonesChip").addEventListener("click", () => $("zonesClear").click());
  $("zonesClear").addEventListener("click", () => {
    S.zones = []; majZones();
    if (S.pages.length) { S.tokens = new Map(); S.counters = {}; detectPages(S.pages); }
  });
  $("selbar").addEventListener("pointerdown", (e) => e.stopPropagation()); // les boutons ne dessinent pas
  // Ce qui est actif maintenant, pour retrouver ensuite les éléments nouvellement masqués.
  // On compare mot par mot : un mot déjà masqué avant n'est pas « nouveau », même si une autre règle l'a repris.
  const cleMot = (pi, w) => pi + "|" + Math.round(w.bbox.x0) + "," + Math.round(w.bbox.y0) + "|" + w.text;
  function instantane() { return new Set(S.pages.flatMap((p, pi) => p.boxes.filter((b) => b.active).flatMap((b) => (b.words || []).map((w) => cleMot(pi, w))))); }
  function nouveaux(avant, sauf) {
    const out = [];
    S.pages.forEach((p, pi) => p.boxes.forEach((b) => {
      if (!b.active || (b.words || []).every((w) => avant.has(cleMot(pi, w)))) return;
      if (sauf && sauf.page === p) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = sauf.rect; if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return; }
      out.push({ page: pi, rects: b.rects || [b] });
    }));
    return out;
  }

  // Découpe une zone sélectionnée en informations distinctes : une par ligne, coupée aux grands espaces,
  // l'étiquette (« N° contribuable : ») écartée, et chaque numéro séparé des mots qui l'entourent.
  // Garde-fou : un morceau trop court ou trop courant (« 002 », « de ») n'est jamais cherché seul.
  function elementsDeSelection(p, rect) {
    const parLigne = new Map();
    p.lines.forEach((l, li) => l.words.forEach((w) => {
      const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2;
      if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
        if (!parLigne.has(li)) parLigne.set(li, []);
        parLigne.get(li).push(w);
      }
    }));
    const elements = [];
    const ajouter = (t) => {
      t = t.replace(/^[\s,;:.\-–]+|[\s,;:–]+$/g, "");
      if (!t) return;
      if (/\d/.test(t)) {
        if (t.replace(/\D/g, "").length < 4 && !K.formeIdentifiant(t)) return;
      } else if (!K.motsACherche(t).length) return;
      if (!elements.includes(t)) elements.push(t);
    };
    for (const mots of parLigne.values()) {
      mots.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      const h = mots.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)[Math.floor(mots.length / 2)] || 10;
      const groupes = [[mots[0]]];
      for (let i = 1; i < mots.length; i++) {
        if (mots[i].bbox.x0 - mots[i - 1].bbox.x1 > h * 1.6) groupes.push([]);
        groupes[groupes.length - 1].push(mots[i]);
      }
      for (const g of groupes) {
        const texte = g.map((w) => w.text).join(" ");
        const valeurs = K.valeursApresEtiquettes(texte).map((v) => v.valeur);
        for (let morceau of valeurs.length ? valeurs : [texte]) {
          if (morceau.includes(":")) morceau = morceau.slice(morceau.lastIndexOf(":") + 1);
          // S'il y a un numéro, on ne cherche que les numéros : les mots autour (« Dossier n° », « Code client »)
          // sont des étiquettes, pas des données. Sans numéro, le groupe entier est cherché (un nom, une adresse).
          const runs = [];
          for (const t of morceau.split(/\s+/).filter(Boolean)) {
            const num = /\d/.test(t), dern = runs[runs.length - 1];
            if (dern && dern.num === num) dern.mots.push(t); else runs.push({ num, mots: [t] });
          }
          const nums = runs.filter((r) => r.num);
          if (nums.length) nums.forEach((r) => ajouter(r.mots.join(" ")));
          else ajouter(morceau);
        }
      }
    }
    return elements;
  }

  $("selAll").addEventListener("click", async () => {
    if (!S.sel || busy) return;
    const { page: p, rect } = S.sel;
    S.sel = null; $("selbar").hidden = true; $("selColonne").hidden = true; finGeste();
    // La zone encadrée est toujours masquée, quoi que la lecture trouve ensuite.
    maskRect(p, rect); afterEdit();
    try {
      setStatus("Lecture du texte…", true);
      await ocr(p);
    } catch (e) { setStatus("La lecture du texte a échoué : la zone a été masquée seule."); return; }
    const elements = elementsDeSelection(p, rect);
    if (!elements.length) { setStatus("Aucune information à chercher dans cette zone : elle a été masquée seule."); return; }
    // Plusieurs éléments : on montre ce qui sera cherché, pour décocher les mots ordinaires (un titre, un en-tête de colonne).
    if (elements.length >= 2 || elements.some((e) => K.queDesMotsCourants(e))) { setStatus(""); choisirElements(p, rect, elements); return; }
    chercherPareils(p, rect, elements);
  });
  function choisirElements(p, rect, elements) {
    const box = $("chercheListe"); box.textContent = "";
    elements.forEach((el, i) => {
      const l = document.createElement("label"), c = document.createElement("input");
      c.type = "checkbox"; c.checked = !K.queDesMotsCourants(el); c.id = "cherche-" + i; c.value = el; // un mot ordinaire est proposé décoché
      l.append(c, document.createTextNode(el)); box.append(l);
    });
    $("cherchePanel").hidden = false;
    $("chercheOk").onclick = () => {
      const choisis = [...box.querySelectorAll("input:checked")].map((c) => c.value);
      $("cherchePanel").hidden = true;
      if (choisis.length) chercherPareils(p, rect, choisis); else setStatus("Rien à chercher : la zone a été masquée seule.");
    };
    $("chercheAnnuler").onclick = () => { $("cherchePanel").hidden = true; setStatus("La zone a été masquée seule."); };
  }
  $("cherchePanel").addEventListener("pointerdown", (e) => e.stopPropagation());
  async function chercherPareils(p, rect, elements) {
    const termes = [];
    for (const el of elements) {
      const m = motifDe(el);
      // Garde-fou : une forme faite seulement de chiffres et trop courte (« 9999 ») attraperait toutes les années et tous les codes.
      // Pour un numéro court, on cherche ce numéro exact, pas sa forme.
      if (m.kind === "regle") m.regles.filter((r) => !(r.forme && /^[9 ]+$/.test(r.forme) && r.forme.replace(/ /g, "").length < 8))
        .forEach((r) => { if (!S.extra.some((x) => x.id === r.id)) S.extra.push(r); });
      else termes.push(m.terme);
    }
    if (termes.length) {
      const champ = $("tOther"), deja = champ.value.split(",").map((x) => norm(x.trim()));
      const ajout = termes.filter((t) => !deja.includes(norm(t)));
      S.parSelection = S.parSelection || new Set(); termes.forEach((x) => S.parSelection.add(norm(x)));
      if (ajout.length) champ.value = [champ.value.trim(), ...ajout].filter(Boolean).join(", ");
    }
    const avant = instantane();
    S.tokens = new Map(); S.counters = {};
    await detectPages(S.pages, () => "");
    const items = nouveaux(avant, { page: p, rect });
    const liste = elements.map((e) => "« " + e + " »").join(", ");
    setStatus(items.length
      ? `${items.length} élément${items.length > 1 ? "s" : ""} semblable${items.length > 1 ? "s" : ""} masqué${items.length > 1 ? "s" : ""} (cherché : ${liste}). Vérifiez-les avec les flèches ‹ ›.`
      : `Rien de semblable ailleurs (cherché : ${liste}). La zone a été masquée.`, true);
    montrerTrouves(items, true);
  }

  /* ------------------ éléments trouvés : vue d'ensemble, étincelles, et on va les voir un par un */
  let scintille = 0;
  function montrerTrouves(items, vueEntiere) {
    if (!items.length) { fermerTrouves(); return; }
    S.trouves = { items, i: -1, t0: performance.now() };
    if (vueEntiere) {
      const p0 = items.find((it) => it.page === S.cur) ? S.cur : items[0].page;
      if (p0 !== S.cur) { S.cur = p0; updateUI(); }
      fitView();
    }
    majTrouves(); render();
    cancelAnimationFrame(scintille);
    let dernier = 0;
    const boucle = (t) => {
      if (!S.trouves || t - S.trouves.t0 > 6200) { render(); return; }
      if (t - dernier > 50) { dernier = t; render(); }
      scintille = requestAnimationFrame(boucle);
    };
    scintille = requestAnimationFrame(boucle);
  }
  function majTrouves() {
    const T = S.trouves;
    $("trouves").hidden = !T;
    if (!T) return;
    const n = T.items.length;
    $("trouvesTexte").textContent = T.i < 0 ? `${n} trouvé${n > 1 ? "s" : ""} · ‹ › pour vérifier` : `${T.i + 1} / ${n}`;
  }
  function fermerTrouves() { S.trouves = null; cancelAnimationFrame(scintille); majTrouves(); render(); }
  function zoomSur(r) {
    fitView();
    const vr = $("viewport").getBoundingClientRect();
    const s = Math.min(S.view.fit * 6, Math.max(S.view.fit * 1.5, Math.min((vr.width * 0.6) / r.w, (vr.height * 0.35) / r.h)));
    S.view.s = s; S.view.tx = vr.width / 2 - (r.x + r.w / 2) * s; S.view.ty = vr.height / 2 - (r.y + r.h / 2) * s;
    applyView(); showFit();
  }
  function allerTrouve(d) {
    const T = S.trouves; if (!T) return;
    T.i = (T.i + d + T.items.length) % T.items.length;
    const it = T.items[T.i];
    if (it.page !== S.cur) { S.cur = it.page; updateUI(); }
    const x0 = Math.min(...it.rects.map((r) => r.x)), y0 = Math.min(...it.rects.map((r) => r.y));
    const x1 = Math.max(...it.rects.map((r) => r.x + r.w)), y1 = Math.max(...it.rects.map((r) => r.y + r.h));
    zoomSur({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    majTrouves(); render();
  }
  $("trouves").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("trouvesPrec").addEventListener("click", () => allerTrouve(-1));
  $("trouvesSuiv").addEventListener("click", () => allerTrouve(1));
  $("trouvesFermer").addEventListener("click", () => { fermerTrouves(); fitView(); render(); });

  /* ------------- « Rechercher ici » : relire de près la zone affichée, sur la photo en pleine résolution */
  // Les petits caractères (un numéro en bas de page) sont souvent trop petits pour le moteur de lecture.
  // On découpe ce qui est à l'écran dans la photo d'origine, on l'agrandit, on le relit, et on cherche dedans.
  async function chercherIci() {
    const p = page(); if (!p || busy) return;
    const z = zoneVisible(); if (z.w < 8 || z.h < 8) return;
    busy = true; $("chercherIci").disabled = true; $("detect").disabled = true;
    setStatus("Lecture de près de cette zone…", true);
    let bm = null;
    try {
      if (!p.lines) { busy = false; await ocr(p); busy = true; }
      let source = p.img, k = 1;
      if (p.source && p.source.blob) {
        try { bm = await createImageBitmap(p.source.blob, { imageOrientation: "from-image" }); source = bm; k = p.source.k; } catch (e) { bm = null; }
      }
      const sx = (z.x + p.off.x) * k, sy = (z.y + p.off.y) * k, sw = z.w * k, sh = z.h * k;
      const f = Math.max(1, Math.min(3, 2000 / Math.max(sw, sh)));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(sw * f)); c.height = Math.max(1, Math.round(sh * f));
      const cx = c.getContext("2d");
      cx.imageSmoothingQuality = "high"; cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
      if (bm && bm.close) { bm.close(); bm = null; }
      const copie = pourLecture(c), echelle = copie.facteur * f * k;
      const w = await getWorker();
      const { data } = await w.recognize(copie);
      const ramener = (b) => ({ x0: z.x + b.x0 / echelle, y0: z.y + b.y0 / echelle, x1: z.x + b.x1 / echelle, y1: z.y + b.y1 / echelle });
      const lu = linesOf(data).map((l) => ({ words: (l.words || []).filter((x) => x.text && x.text.trim()).map((x) => ({ text: x.text, bbox: ramener(x.bbox), conf: x.confidence })) }))
        .filter((l) => l.words.length);
      // La lecture de près remplace l'ancienne lecture de cette zone.
      const dedans = (wd) => { const mx = (wd.bbox.x0 + wd.bbox.x1) / 2, my = (wd.bbox.y0 + wd.bbox.y1) / 2; return mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h; };
      p.lines = p.lines.map((l) => ({ words: l.words.filter((wd) => !dedans(wd)) })).filter((l) => l.words.length).concat(lu);
      const avant = instantane();
      detect(p); changed(); render();
      const items = nouveaux(avant);
      const nMots = lu.reduce((n, l) => n + l.words.length, 0);
      setStatus(items.length
        ? `Lecture de près : ${items.length} élément${items.length > 1 ? "s" : ""} de plus masqué${items.length > 1 ? "s" : ""} dans cette zone.`
        : nMots ? `Lecture de près : ${nMots} mot${nMots > 1 ? "s" : ""} lu${nMots > 1 ? "s" : ""}, rien de plus à masquer ici.` : "Lecture de près : aucun texte lisible ici. Si quelque chose doit disparaître, effacez-le au doigt.", true);
      montrerTrouves(items, false);
    } catch (e) {
      setStatus("La lecture de près a échoué. Effacez au doigt, ou réessayez.");
    } finally {
      if (bm && bm.close) bm.close();
      busy = false; $("chercherIci").disabled = false; $("detect").disabled = !S.pages.length;
      updateUI(); renderLegend();
    }
  }
  $("chercherIci").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("chercherIci").addEventListener("click", chercherIci);

  /* --------------------------------------------- lecture (OCR) et détection */
  let workerP = null;
  function getWorker() {
    if (!workerP) {
      workerP = Tesseract.createWorker("fra", 1, {
        workerPath: FIGE ? FIGE.ocrWorker : abs("vendor/tesseract/worker.min.js"),
        corePath: FIGE ? "fige/core" : abs("vendor/tesseract/core"),
        langPath: FIGE ? "fige/lang" : abs("vendor/tesseract/lang"),
        workerBlobURL: false,
        cacheMethod: "none",
        logger: (m) => {
          if (m.status === "recognizing text") setStatus(`Lecture du texte… ${Math.round(m.progress * 100)} %`, true);
          else if (m.status && m.progress < 1) setStatus("Préparation du moteur de lecture…", true);
        },
      }).then(async (w) => {
        // Mode « texte épars » : lit chaque bloc séparément, mieux adapté aux formulaires et aux colonnes.
        try { await w.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" }); } catch (e) {}
        return w;
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
  // La copie est agrandie jusqu'à ~2500 pixels de large (l'équivalent d'un scan à 300 dpi), où la lecture est la plus fiable.
  function pourLecture(src) {
    const k = Math.max(1, Math.min(2, 2500 / Math.max(src.width, 1)));
    const c = document.createElement("canvas");
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, c.width, c.height);
    c.facteur = k;
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; hist[g]++; }
    const total = d.length / 4;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < total * 0.01) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < total * 0.05) hi--;
    // Renforcer le contraste seulement si l'image est terne (papier gris, encre pâle).
    // Sur une page blanche avec peu de texte, les repères tombent sur le blanc : on ne touche à rien.
    const span = hi - lo;
    const etirer = span >= 60 && span < 230;
    // Fond blanc (scan, PDF, capture d'écran) : le texte gris clair est assombri, pour être lu comme le reste.
    let med = 0; acc = 0;
    while (med < 255 && (acc += hist[med]) < total * 0.5) med++;
    const blanc = med >= 228;
    for (let i = 0; i < d.length; i += 4) {
      let v = etirer ? Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)) : d[i];
      if (blanc) v = v >= med - 8 ? 255 : 255 * Math.pow(v / med, 2.4);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    effacerTraits(d, c.width, c.height);
    x.putImageData(im, 0, 0);
    return c;
  }
  // Les traits d'un tableau gênent beaucoup la lecture : sur la copie lue (jamais sur l'image affichée),
  // toute ligne sombre plus longue qu'un mot est effacée. Les lettres, elles, ne font jamais de si longs traits.
  function effacerTraits(d, W, H) {
    const Lh = Math.max(60, Math.round(W * 0.05)), Lv = Math.max(60, Math.round(H * 0.035));
    const sombre = (i) => d[i * 4] < 150;
    const blanchir = [];
    for (let y = 0; y < H; y++) {
      let deb = -1;
      for (let x = 0; x <= W; x++) {
        const s = x < W && sombre(y * W + x);
        if (s && deb < 0) deb = x;
        if (!s && deb >= 0) { if (x - deb >= Lh) blanchir.push([deb, y, x - deb, 1]); deb = -1; }
      }
    }
    for (let x = 0; x < W; x++) {
      let deb = -1;
      for (let y = 0; y <= H; y++) {
        const s = y < H && sombre(y * W + x);
        if (s && deb < 0) deb = y;
        if (!s && deb >= 0) { if (y - deb >= Lv) blanchir.push([x, deb, 1, y - deb]); deb = -1; }
      }
    }
    // Un peu de marge autour du trait : son bord gris est effacé aussi.
    for (const [x0, y0, w, h] of blanchir) {
      for (let y = Math.max(0, y0 - (h === 1 ? 1 : 0)); y < Math.min(H, y0 + h + (h === 1 ? 1 : 0)); y++)
        for (let x = Math.max(0, x0 - (w === 1 ? 1 : 0)); x < Math.min(W, x0 + w + (w === 1 ? 1 : 0)); x++) { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; }
    }
  }

  async function ocr(p) {
    if (p.lines) return;
    const w = await getWorker();
    const copie = pourLecture(p.img), k = copie.facteur;
    const { data } = await w.recognize(copie);
    // Les positions lues sur la copie agrandie sont ramenées à l'échelle de l'image.
    const ramener = (b) => ({ x0: b.x0 / k, y0: b.y0 / k, x1: b.x1 / k, y1: b.y1 / k });
    p.lines = linesOf(data).map((l) => ({ words: (l.words || []).filter((x) => x.text && x.text.trim()).map((x) => ({ text: x.text, bbox: ramener(x.bbox), conf: x.confidence })) }));
    p.genre = genreDe(p);
    majStyleChip();
  }
  /* Document ou photo ? Un document (lettre, formulaire, tableau, capture d'écran) a beaucoup de mots lisibles et un fond uni ;
   * une photo (des personnes, un lieu) a peu de mots et des couleurs variées. Une lettre photographiée sur une table reste un document. */
  function genreDe(p) {
    const mots = (p.lines || []).reduce((n, l) => n + l.words.filter((w) => (w.conf == null || w.conf >= 60) && w.text.length >= 2).length, 0);
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(p.img, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data;
    const seaux = new Map();
    for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 5) * 64 + (d[i + 1] >> 5) * 8 + (d[i + 2] >> 5); seaux.set(k, (seaux.get(k) || 0) + 1); }
    const fond = Math.max(...seaux.values()) / (64 * 64); // part de la couleur dominante
    return (mots >= 60 || (mots >= 15 && fond >= 0.3)) ? "document" : "photo";
  }
  // Le petit mot qui dit le style choisi pour cette page ; un toucher le change.
  function majStyleChip() {
    const p = page(), chip = $("styleChip");
    if (!chip) return;
    chip.hidden = !p || !p.genre || styleMasque !== "auto";
    if (chip.hidden) return;
    const s = styleDe(p);
    chip.textContent = (s === "flou" ? "Flou opaque" : s === "noir" ? "Noir" : "Couleur du papier") + (p.styleForce ? "" : p.genre === "photo" ? " · photo" : " · document") + " ▾";
  }

  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const isWordChar = (c) => !!c && /[a-z0-9]/i.test(c);

  function userTerms() {
    const out = [];
    const ORIGINES = { tNames: "vos noms (Ce qu'il faut masquer)", tAddr: "vos adresses (Ce qu'il faut masquer)", tOther: "vos termes (Ce qu'il faut masquer)" };
    const add = (field, type, splitWords) => $(field).value.split(",").map((s) => s.trim()).filter((s) => s.length > 1).forEach((t) => {
      const key = type + "|" + norm(t);
      const origine = field === "tOther" && S.parSelection && S.parSelection.has(norm(t)) ? "Tous les pareils" : ORIGINES[field];
      out.push({ type, value: t, key, origine });
      if (splitWords) t.split(/\s+/).filter((w) => w.length >= 3).forEach((w) => out.push({ type, value: t, key, needle: w, origine }));
    });
    add("tNames", "PERSONNE", true); add("tAddr", "ADRESSE", false); add("tOther", "DONNEE", false);
    // Dernier balayage, valeurs lues après une étiquette (« Nom : … ») et zones référencées : cherchées partout ailleurs.
    (S.balayage || []).concat(S.appris || []).forEach((t) => {
      t = { ...t, origine: t.ref ? "Référencer" : t.appris ? "un nom ou une adresse trouvé après une étiquette" : "le dernier balayage" };
      out.push(t);
      if (t.type === "PERSONNE") t.value.split(/\s+/).filter((w) => w.length >= 3 && !K.estCourant(w)).forEach((w) => out.push({ ...t, needle: w }));
    });
    return out.sort((a, b) => (b.needle || b.value).length - (a.needle || a.value).length);
  }

  function tokenFor(key, type, value) {
    if (!S.tokens.has(key)) {
      S.counters[type] = (S.counters[type] || 0) + 1;
      // Une étiquette renommée par l'utilisateur garde son nouveau nom, même si la détection est refaite.
      const propre = S.renomme && S.renomme.get(key);
      S.tokens.set(key, { token: propre ? `[${propre}]` : `[${type}_${S.counters[type]}]`, type, value, key });
    }
    return S.tokens.get(key).token;
  }

  // Renommer une étiquette : NOM_1 devient le code choisi par l'utilisateur, sur toutes les pages d'un coup.
  // Kerckhoffs ne garde rien : le renommage est oublié avec le document. La correspondance reste chez l'utilisateur.
  function codeValide(brut) {
    const code = String(brut || "").trim().toUpperCase().replace(/\s+/g, "_");
    return /^[A-Z0-9][A-Z0-9_.\-\/]{0,23}$/.test(code) ? code : null;
  }
  function renommerEtiquette(ancien, brut) {
    const code = codeValide(brut);
    if (!code) return "Le code ne peut contenir que des lettres sans accent, des chiffres et _ . - / (24 signes au plus).";
    const neuf = `[${code}]`;
    if (neuf === ancien) return "";
    if ([...S.tokens.values()].some((t) => t.token === neuf)) return "Ce code est déjà utilisé par une autre étiquette.";
    const t = [...S.tokens.values()].find((x) => x.token === ancien);
    if (!t) return "Étiquette introuvable.";
    if (!S.renomme) S.renomme = new Map();
    S.renomme.set(t.key, code);
    t.token = neuf;
    S.pages.forEach((p) => p.boxes.forEach((b) => { if (b.token === ancien) b.token = neuf; }));
    changed(); render(); renderLegend();
    setStatus(`${ancien} s'appelle maintenant ${neuf}, sur toutes les pages.`);
    return "";
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
      const take = (ranges, s, e, type, value, key, flag, source) => {
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
        const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rects, key, token: tokenFor(key, type, value), words: idx.map((i) => words[i]), active: true, flag, source };
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
          take(rr, m.index, m.index + m[0].length, r.type, v, r.type + "|" + v.replace(/[\s.]/g, "").toLowerCase(), bad ? "à relire" : null,
            r.forme || r.numero || String(r.id).startsWith("sel-") ? "Tous les pareils" : String(r.id).startsWith("balayage") ? "le dernier balayage" : "la détection : " + (r.label || r.type.toLowerCase()));
        }
      }
      // Zones répétées : si du texte se trouve au même endroit que sur une page précédente, il est masqué.
      for (const z of S.zones) {
        const W = p.img.width, H = p.img.height, mx = 0.02 * W, my = 0.02 * H;
        words.forEach((w, i) => {
          const cx = (w.bbox.x0 + w.bbox.x1) / 2, cy = (w.bbox.y0 + w.bbox.y1) / 2;
          if (cx >= z.x * W - mx && cx <= (z.x + z.w) * W + mx && cy >= z.y * H - my && cy <= (z.y + z.h) * H + my)
            take(rr, rr[i][0], rr[i][1], "ZONE", w.text, "ZONE|" + norm(w.text), null, "« Même endroit, chaque page »");
        });
      }
      // Valeurs qui suivent une étiquette de formulaire (« Nom : », « Né le »…), voir rules/etiquettes.js
      for (const v of K.valeursApresEtiquettes(raw)) {
        take(rr, v.debut, v.fin, v.etiquette.type, v.valeur, v.etiquette.type + "|" + norm(v.valeur), null, "ce qui suit l'étiquette « " + v.etiquette.mots[0] + " »");
      }
      // Identifiants reconnus à leur forme, dans n'importe quel pays (rules/registre.js : K.formeIdentifiant).
      // Forme très typique : masqué d'office. Forme douteuse : signalé avant l'envoi, dans Remove Before Flight.
      for (const c of K.candidatsIdentifiant(raw)) {
        if (c.niveau === 2) take(rr, c.debut, c.fin, "IDENT", c.valeur, "IDENT|" + c.valeur.replace(/[\s.\-\/_]/g, "").toLowerCase(), null, "sa forme d'identifiant");
      }
      for (const t of terms) {
        const needle = norm(t.needle || t.value);
        let from = 0, k;
        while ((k = nrm.indexOf(needle, from)) > -1) {
          from = k + 1;
          if (isWordChar(nrm[k - 1]) || isWordChar(nrm[k + needle.length])) continue;
          take(nr, k, k + needle.length, t.type, t.value, t.key, null, t.origine);
        }
      }
      // Puis mot par mot, en tolérant les erreurs de lecture (rules/registre.js : K.ressemble).
      // Ainsi « Dupont » est trouvé même lu « DUP0NT », et une adresse même coupée ou mal espacée.
      for (const t of terms) {
        if (t.needle) continue;
        const cherches = K.motsACherche(t.value);
        // Au-delà de quatre mots, c'est une liste (plusieurs personnes, plusieurs références) : un numéro par mot.
        const liste = cherches.length > 4;
        words.forEach((w, i) => {
          if (used.has(i)) return;
          const c = cherches.find((x) => K.ressemble(w.text, x));
          if (c) take(rr, rr[i][0], rr[i][1], t.type, liste ? c : t.value, liste ? t.type + "|" + norm(c) : t.key, null, t.origine + " (« " + c + " »)");
        });
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
      // Un nom trouvé après « Nom : » est ensuite cherché partout, sur toutes les pages, avec le même numéro.
      if (apprendreEtiquettes()) S.pages.forEach((p) => { if (p.lines) detect(p); });
      changed(); render();
      const n = S.pages.reduce((s, p) => s + p.boxes.filter((b) => b.active).length, 0);
      const flagged = S.pages.reduce((s, p) => s + p.boxes.filter((b) => b.flag).length, 0);
      // Ce que vous avez écrit dans « Réglages » et qui n'a été retrouvé nulle part : on le dit, pour que vous l'encadriez vous-même.
      const trouvees = new Set(S.pages.flatMap((p) => p.boxes.map((b) => b.key)));
      const masques = S.pages.flatMap((p) => p.boxes.flatMap((b) => (b.words || []).map((w) => w.text)));
      const estMasque = (t) => trouvees.has(t.key) || (K.motsACherche(t.value).length > 0 &&
        K.motsACherche(t.value).every((c) => masques.some((m) => K.ressemble(m, c) || norm(m).includes(norm(c)))));
      const absents = [...new Map(userTerms().filter((t) => !t.needle && !estMasque(t)).map((t) => [t.key, t.value])).values()];
      const manque = absents.length
        ? ` Pas retrouvé${absents.length > 1 ? "s" : ""} : « ${absents.slice(0, 4).join(" », « ")} »${absents.length > 4 ? "…" : ""}. ` +
          "La photo est peut-être trop pâle à cet endroit : encadrez-le avec « Rectangle »."
        : "";
      if (message) setStatus(message() + manque, !!manque); else setStatus((n ? `${n} zone${n > 1 ? "s" : ""} masquée${n > 1 ? "s" : ""} automatiquement.${flagged ? ` ${flagged} à relire (encadrée en orange).` : ""} Relisez et complétez au doigt.`
                  : "Rien trouvé automatiquement. Pour les noms, écrivez-les dans « Réglages », ou effacez-les au doigt.") + manque, !!manque);
    } catch (e) {
      setStatus("La lecture du texte a échoué (" + ((e && (e.message || e)) + "").slice(0, 120) + "). Effacez au doigt, ou réessayez.");
    } finally {
      busy = false; $("detect").disabled = !S.pages.length;
      updateUI();
    }
  }
  $("detect").addEventListener("click", () => {
    detectPages(S.pages.filter(Boolean));
  });
  ["tNames", "tAddr", "tOther"].forEach((id) => $(id).addEventListener("change", () => {
    if (!S.pages.length) return;
    S.tokens = new Map(); S.counters = {};
    detectPages(S.pages); // relit si besoin, puis masque les nouveaux termes partout
  }));

  // Les valeurs qui suivent une étiquette de personne ou d'adresse deviennent des termes à chercher partout.
  // La clé est la même que celle de la valeur trouvée après l'étiquette : le même numéro partout (PERSONNE_1…).
  const TYPES_APPRIS = ["PERSONNE", "ADRESSE"];
  function apprendreEtiquettes() {
    S.appris = S.appris || [];
    const vus = new Set(S.appris.map((t) => t.key));
    let nouveau = false;
    for (const p of S.pages) for (const l of p.lines || []) {
      const raw = l.words.map((w) => w.text).join(" ");
      for (const v of K.valeursApresEtiquettes(raw)) {
        const type = v.etiquette.type;
        if (!TYPES_APPRIS.includes(type) || /\d{3,}/.test(v.valeur) && type === "PERSONNE") continue;
        if (!K.motsACherche(v.valeur).length) continue;
        const key = type + "|" + norm(v.valeur);
        if (vus.has(key)) continue;
        vus.add(key); S.appris.push({ type, value: v.valeur, key, appris: true }); nouveau = true;
      }
    }
    return nouveau;
  }

  function renderLegend() {
    const used = new Set();
    S.pages.forEach((p) => p.boxes.forEach((b) => { if (b.active) used.add(b.token); }));
    const rows = [...S.tokens.values()].filter((t) => used.has(t.token));
    const L = $("legend");
    L.hidden = !rows.length || !$("optMask").checked;
    L.textContent = "";
    if (!rows.length) return;
    const titre = document.createElement("p"); titre.className = "legend-titre";
    titre.textContent = "Légende (affichée ici seulement, jamais exportée)";
    L.append(titre);
    rows.forEach((t) => {
      const ligne = document.createElement("div"); ligne.className = "legend-ligne";
      const txt = document.createElement("span"); txt.textContent = `${t.token} = ${t.value}`;
      const bouton = document.createElement("button"); bouton.type = "button"; bouton.className = "btn small";
      bouton.textContent = "Renommer";
      bouton.addEventListener("click", () => {
        ligne.textContent = "";
        const champ = document.createElement("input"); champ.type = "text"; champ.maxLength = 24;
        champ.placeholder = "votre code, ex. P-2026-118"; champ.autocapitalize = "characters"; champ.spellcheck = false;
        champ.setAttribute("aria-label", `Nouveau nom pour ${t.token}`);
        const ok = document.createElement("button"); ok.type = "button"; ok.className = "btn small primary"; ok.textContent = "OK";
        const non = document.createElement("button"); non.type = "button"; non.className = "btn small"; non.textContent = "✕";
        non.setAttribute("aria-label", "Annuler");
        const aide = document.createElement("p"); aide.className = "hint";
        aide.textContent = `Remplace ${t.token} sur toutes les pages. N'écrivez jamais le vrai nom : ce code partira avec le document.`;
        const valider = () => { const err = renommerEtiquette(t.token, champ.value); if (err) aide.textContent = err; };
        ok.addEventListener("click", valider);
        non.addEventListener("click", renderLegend);
        champ.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); valider(); } else if (e.key === "Escape") { e.preventDefault(); renderLegend(); } });
        ligne.append(champ, ok, non, aide);
        champ.focus();
      });
      ligne.append(txt, bouton);
      L.append(ligne);
    });
  }
  $("optMask").addEventListener("change", () => { changed(); renderLegend(); });

  /* ------------------------------------------------------------- export */
  // La mention en bas des documents envoyés. Sans le mode strict, elle est toujours là.
  // Seul un document contrôlé en mode strict peut partir sans mention, si l'utilisateur le choisit.
  const avecMention = () => !strict || $("optMention").checked;
  const texteMention = () => "Masqué avec Kerckhoffs · " + (S.pages.some((p) => styleDe(p) === "papier") ? "effacé couleur papier · " : "") +
    (strict ? "vérifié point par point" : "non vérifié point par point");
  function avecBande(c, masked) {
    if (!masked || !avecMention()) return c;
    const h = Math.max(22, Math.round(c.width * 0.028));
    const o = document.createElement("canvas");
    o.width = c.width; o.height = c.height + h;
    const x = o.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, o.width, o.height);
    x.drawImage(c, 0, 0);
    x.fillStyle = "#eef1f4"; x.fillRect(0, c.height, o.width, h);
    x.fillStyle = "#5a6872"; x.font = `${Math.round(h * 0.5)}px system-ui, sans-serif`; x.textBaseline = "middle";
    x.fillText(texteMention(), Math.round(h * 0.6), c.height + h / 2);
    return o;
  }
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
  // Le nom du fichier ne contient que la date et un numéro : ni l'heure, ni le fuseau horaire.
  let numeroExport = 0;
  function jour() { const d = new Date(), z = (n) => String(n).padStart(2, "0"); return `${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}`; }
  function stamp() { numeroExport++; return `${jour()}-${numeroExport}`; }

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
      const dans = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      for (const line of p.lines) {
        const parts = [], done = new Set();
        const pousser = (s) => { if (parts[parts.length - 1] !== s) parts.push(s); };
        for (const w of line.words) {
          if (masked) {
            const mx = (w.bbox.x0 + w.bbox.x1) / 2, my = (w.bbox.y0 + w.bbox.y1) / 2;
            const st = p.strokes.find((s) => (s.kind === "rect" && dans(s, mx, my)) || (s.etiq && s.etiq.rects.some((r) => dans(r, mx, my))));
            if (st) { const e = st.ref || st.etiq; pousser(e ? tokenFor(e.key, e.type, e.value) : "[MASQUÉ]"); continue; }
          }
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
      let text = await buildText(masked);
      if (masked && avecMention()) text += "\n\n— " + texteMention();
      return { text, files: [new File([text], base + ".txt", { type: "text/plain" })] };
    }
    if (f === "pdf") {
      const { jsPDF } = window.jspdf;
      let doc = null;
      for (const p of S.pages) {
        const c = avecBande(finalCanvas(p, masked), masked);
        const o = c.width > c.height ? "l" : "p";
        if (!doc) doc = new jsPDF({ orientation: o, unit: "px", format: [c.width, c.height], hotfixes: ["px_scaling"], compress: true });
        else doc.addPage([c.width, c.height], o);
        doc.addImage(c.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, c.width, c.height);
      }
      doc.setProperties({ title: "Document", author: "", subject: "", keywords: "", creator: "" });
      doc.setCreationDate(`D:${jour()}000000+00'00'`); // la date seule, en heure universelle : rien sur le lieu ni l'heure
      return { files: [new File([doc.output("blob")], base + ".pdf", { type: "application/pdf" })] };
    }
    const files = [];
    for (let i = 0; i < S.pages.length; i++) {
      let c = finalCanvas(S.pages[i], masked);
      if (f === "light") c = lighten(c);
      c = avecBande(c, masked);
      const b = await blobOf(c, "image/jpeg", f === "light" ? 0.72 : 0.9);
      files.push(new File([b], `${base}${S.pages.length > 1 ? "-p" + (i + 1) : ""}.jpg`, { type: "image/jpeg" }));
    }
    return { files };
  }

  async function prepared() {
    const key = S.version + "|" + fmt() + "|" + $("optMask").checked + "|" + strict + "|" + avecMention();
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
  $("btnShare").addEventListener("click", () => closeSheet());

  // Ce navigateur sait-il partager un fichier vers une autre application ? (Firefox sur Android, la plupart des ordinateurs : non)
  function partageFichiers() {
    try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File(["x"], "x.jpg", { type: "image/jpeg" })] })); }
    catch (e) { return false; }
  }
  async function doShare() {
    let out;
    try { out = await prepared(); } catch (e) { setStatus("L'export a échoué. Réessayez."); return; }
    const data = fmt() === "text" ? { text: out.text } : { files: out.files };
    if (!navigator.share || (data.files && navigator.canShare && !navigator.canShare(data))) {
      save(out);
      setStatus("Ce navigateur ne sait pas partager un fichier : il a été enregistré dans vos Téléchargements. Vous pouvez aussi le copier (menu, « Copier l'image »), puis le coller dans un message ou une IA.", true);
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
        return blobOf(avecBande(c, masked), "image/png");
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
  $("btnCopy").addEventListener("click", () => { closeSheet(); avecCerbere(doCopy); });

  /* ------------------ profil : les mots appris, gardés dans un QR code chiffré que VOUS conservez */
  // Le profil ne contient que des listes de mots et des formes simples (ex. « 99-999 »), jamais de code ni de document.
  const PROFIL_PREFIXE = "KERCKHOFFS:1:";
  const LIMITES = { mots: 150, longueur: 80, formes: 30 };
  let profilSnapshot = "";       // contenu du profil au dernier enregistrement ou ouverture
  let profilEnAttente = null;    // texte du QR code lu, en attente de la phrase de passe
  let profilLu = null;           // profil déchiffré, en attente de confirmation

  const liste = (id) => $(id).value.split(",").map((s) => s.trim()).filter(Boolean);
  // Format des QR codes de préférences. RÈGLE : une nouvelle version de Kerckhoffs doit toujours savoir lire
  // les QR codes des versions précédentes. On n'enlève jamais un format : si FORMAT_PROFIL augmente,
  // validerProfil continue d'accepter les anciens et complète ce qui leur manque.
  const FORMAT_PROFIL = 1;
  function profilActuel() {
    return {
      v: FORMAT_PROFIL,
      noms: liste("tNames"), adresses: liste("tAddr"), autres: liste("tOther"),
      formes: S.extra.filter((r) => r.forme).map((r) => r.forme),
      numeros: S.extra.filter((r) => r.numero).map((r) => r.numero),
      zones: [], // les zones répétées ne servent que pour le document en cours : elles ne sont jamais gardées
      dates: S.extra.some((r) => r.id === "sel-date"),
    };
  }
  const profilVide = (p) => !p.noms.length && !p.adresses.length && !p.autres.length && !p.formes.length && !p.numeros.length && !p.zones.length && !p.dates;
  const profilModifie = () => { const p = profilActuel(); return !profilVide(p) && JSON.stringify(p) !== profilSnapshot; };

  // Contrôle strict : tout ce qui ne correspond pas exactement au format attendu est refusé.
  const FORME_OK = /^[A-Za-zÀ-ÿ0-9 .\-\/:'’]{2,40}$/;
  function validerProfil(o) {
    if (!o || typeof o !== "object" || Array.isArray(o) || !Number.isInteger(o.v) || o.v < 1 || o.v > FORMAT_PROFIL) return null;
    const cles = ["v", "noms", "adresses", "autres", "formes", "numeros", "zones", "dates"];
    o.numeros = o.numeros || []; o.zones = o.zones || []; // profils plus anciens
    if (Object.keys(o).some((k) => !cles.includes(k))) return null;
    const mots = (a) => Array.isArray(a) && a.length <= LIMITES.mots &&
      a.every((s) => typeof s === "string" && s.length >= 1 && s.length <= LIMITES.longueur && !/[\u0000-\u001f<>]/.test(s));
    if (!mots(o.noms) || !mots(o.adresses) || !mots(o.autres)) return null;
    if (!Array.isArray(o.formes) || o.formes.length > LIMITES.formes || !o.formes.every((f) => typeof f === "string" && FORME_OK.test(f))) return null;
    if (!Array.isArray(o.numeros) || o.numeros.length > LIMITES.formes || !o.numeros.every((n) => typeof n === "string" && /^\d{4,24}$/.test(n))) return null;
    if (!Array.isArray(o.zones) || o.zones.length > 20 || !o.zones.every((z) => Array.isArray(z) && z.length === 4 && z.every((v) => typeof v === "number" && v >= 0 && v <= 1))) return null;
    if (typeof o.dates !== "boolean") return null;
    return o;
  }

  function appliquerProfil(o) {
    const fusion = (id, a) => { const v = liste(id); a.forEach((x) => { if (!v.includes(x)) v.push(x); }); $(id).value = v.join(", "); };
    fusion("tNames", o.noms); fusion("tAddr", o.adresses); fusion("tOther", o.autres);
    o.formes.forEach((f) => { if (!S.extra.some((r) => r.forme === f)) S.extra.push(formeVersRegle(f)); });
    if (o.dates && !S.extra.some((r) => r.id === "sel-date")) S.extra.push({ id: "sel-date", type: "DATE", re: DATE_RE() });
    o.numeros.forEach((n) => { if (!S.extra.some((r) => r.numero === n)) S.extra.push(numeroVersRegle(n)); });
    // Les zones d'anciens profils sont ignorées : une zone ne vaut que pour le document où elle a été tracée.
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
    if (o.numeros.length) parts.push(`${o.numeros.length} numéro${o.numeros.length > 1 ? "s" : ""}`);
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

  // Une zone touche-t-elle un endroit masqué ? (on écarte le « bruit » de lecture au bord des zones noires)
  function presDuMasque(cache, b) {
    const mx = (b.x1 - b.x0) * 0.25 + 4, my = (b.y1 - b.y0) * 0.4 + 4;
    for (const x of [b.x0 - mx, (b.x0 + b.x1) / 2, b.x1 + mx]) for (const y of [b.y0 - my, (b.y0 + b.y1) / 2, b.y1 + my]) if (cache(x, y)) return true;
    return false;
  }

  // Zones qui ressemblent à de l'écriture (petites taches sombres alignées) mais où aucun mot n'a été lu :
  // un texte trop petit ou trop flou, une signature, un tampon. Ce que Kerckhoffs ne lit pas, une IA peut souvent le lire.
  function zonesSansTexte(p, cache) {
    const k = Math.min(1, 1200 / Math.max(p.img.width, p.img.height));
    const W = Math.max(1, Math.round(p.img.width * k)), H = Math.max(1, Math.round(p.img.height * k));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(p.img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, lum = new Uint8Array(W * H);
    let somme = 0;
    for (let i = 0; i < W * H; i++) { lum[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; somme += lum[i]; }
    // Seuil assez haut pour attraper une écriture pâle ou floue, mais relatif au fond (papier blanc ou photo grise).
    const seuil = Math.min(205, somme / (W * H) - 40);
    const noir = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) noir[i] = lum[i] < seuil ? 1 : 0;
    // On retire ce qui est déjà masqué et tous les mots déjà lus.
    const effacer = (x0, y0, x1, y1) => {
      for (let yy = Math.max(0, Math.floor(y0 * k)); yy < Math.min(H, Math.ceil(y1 * k)); yy++)
        for (let xx = Math.max(0, Math.floor(x0 * k)); xx < Math.min(W, Math.ceil(x1 * k)); xx++) noir[yy * W + xx] = 0;
    };
    (p.lines || []).forEach((l) => l.words.forEach((w) => { const m = (w.bbox.y1 - w.bbox.y0) * 0.3; effacer(w.bbox.x0 - m, w.bbox.y0 - m, w.bbox.x1 + m, w.bbox.y1 + m); }));
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (noir[yy * W + xx] && cache((xx + 0.5) / k, (yy + 0.5) / k)) noir[yy * W + xx] = 0;
    // Taches sombres, de la taille d'une lettre.
    const vu = new Uint8Array(W * H), taches = [], pile = [];
    for (let i = 0; i < W * H; i++) {
      if (!noir[i] || vu[i]) continue;
      let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
      pile.push(i); vu[i] = 1;
      while (pile.length) {
        const j = pile.pop(), jx = j % W, jy = (j - jx) / W;
        n++; if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
        for (const v of [j - 1, j + 1, j - W, j + W]) {
          if (v < 0 || v >= W * H || vu[v] || !noir[v]) continue;
          if ((v === j - 1 && jx === 0) || (v === j + 1 && jx === W - 1)) continue;
          vu[v] = 1; pile.push(v);
        }
      }
      const h = y1 - y0 + 1, w = x1 - x0 + 1;
      if (h >= 2 && h <= 30 && w <= 3 * h + 3 && n >= 3) taches.push({ x0, y0, x1, y1, h });
      if (taches.length > 4000) return []; // trop de taches : une photo, une texture, pas du texte
    }
    // Les taches alignées et rapprochées forment une ligne d'écriture.
    taches.sort((a, b) => a.x0 - b.x0);
    const lignes = [];
    for (const t of taches) {
      const l = lignes.find((g) => t.x0 - g.x1 <= 1.8 * Math.max(g.h, t.h) && t.x0 >= g.x0 - 2 &&
        Math.min(g.y1, t.y1) - Math.max(g.y0, t.y0) >= 0.4 * Math.min(g.h, t.h));
      if (l) { l.x1 = Math.max(l.x1, t.x1); l.y0 = Math.min(l.y0, t.y0); l.y1 = Math.max(l.y1, t.y1); l.h = Math.max(l.h, t.h); l.n++; }
      else lignes.push({ ...t, n: 1 });
    }
    return lignes.filter((l) => l.n >= 5 && l.x1 - l.x0 >= 4 * l.h)
      .sort((a, b) => b.n - a.n).slice(0, 6)
      .map((l) => { const m = l.h * 0.5; return { x: (l.x0 - m) / k, y: (l.y0 - m) / k, w: (l.x1 - l.x0 + 1 + 2 * m) / k, h: (l.y1 - l.y0 + 1 + 2 * m) / k }; });
  }

  /* Une signature : un grand tracé fin et courbe, plus haut qu'une ligne de texte, où la lecture ne trouve pas de mots.
   * Les traits droits (tableaux, soulignés) et les grandes lettres pleines (logos) sont écartés. */
  function signatures(p, cache) {
    const k = Math.min(1, 1000 / Math.max(p.img.width, p.img.height));
    const W = Math.max(1, Math.round(p.img.width * k)), H = Math.max(1, Math.round(p.img.height * k));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(p.img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    const hauteurs = (p.lines || []).flatMap((l) => l.words.filter((w) => w.conf == null || w.conf >= 60).map((w) => (w.bbox.y1 - w.bbox.y0) * k)).sort((a, b) => a - b);
    const hT = hauteurs.length ? hauteurs[Math.floor(hauteurs.length / 2)] : 12;
    // encre : sombre, ou bleue (stylo)
    const encre = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], l = r * 0.299 + g * 0.587 + b * 0.114;
      if (l < 120 || (b > r + 30 && b > g + 15 && l < 200)) encre[i] = 1;
    }
    // les mots bien lus ne sont pas une signature
    (p.lines || []).forEach((l) => l.words.forEach((w) => {
      if (w.conf != null && w.conf < 60) return;
      for (let yy = Math.max(0, Math.floor(w.bbox.y0 * k)); yy < Math.min(H, Math.ceil(w.bbox.y1 * k)); yy++)
        for (let xx = Math.max(0, Math.floor(w.bbox.x0 * k)); xx < Math.min(W, Math.ceil(w.bbox.x1 * k)); xx++) encre[yy * W + xx] = 0;
    }));
    // un trait de signature est fin : on relie ses morceaux en grossissant un peu l'encre
    const gros = new Uint8Array(W * H);
    for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) {
      const i = yy * W + xx;
      if (encre[i] || encre[i - 1] || encre[i + 1] || encre[i - W] || encre[i + W]) gros[i] = 1;
    }
    const vu = new Uint8Array(W * H), out = [], pile = [];
    for (let i = 0; i < W * H; i++) {
      if (!gros[i] || vu[i]) continue;
      let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0, visibles = 0;
      const pts = [];
      pile.push(i); vu[i] = 1;
      while (pile.length) {
        const j = pile.pop(), jx = j % W, jy = (j - jx) / W;
        if (encre[j]) { n++; pts.push(j); if (!cache((jx + 0.5) / k, (jy + 0.5) / k)) visibles++; }
        if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
        for (const v of [j - 1, j + 1, j - W, j + W, j - W - 1, j - W + 1, j + W - 1, j + W + 1]) {
          if (v < 0 || v >= W * H || vu[v] || !gros[v]) continue;
          const vx = v % W; if (Math.abs(vx - jx) > 1) continue;
          vu[v] = 1; pile.push(v);
        }
        if (pts.length > 60000) break;
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (h < 2.2 * hT || h > 0.3 * H || w < 2.4 * hT || w > 0.6 * W) continue;
      if (n / (w * h) > 0.16 || n < 40) continue;          // trop plein : un logo, un tampon rempli
      if (visibles / n < 0.4) continue;                       // déjà masquée pour l'essentiel
      // un long trait droit, horizontal ou vertical : un tableau, un souligné
      const lignes = new Uint16Array(h), colonnes = new Uint16Array(w);
      pts.forEach((j) => { const jx = j % W, jy = (j - jx) / W; lignes[jy - y0]++; colonnes[jx - x0]++; });
      if (Math.max(...lignes) > 0.6 * w || Math.max(...colonnes) > 0.6 * h) continue;
      const m = hT * 0.4;
      out.push({ x: (x0 - m) / k, y: (y0 - m) / k, w: (w + 2 * m) / k, h: (h + 2 * m) / k });
      if (out.length >= 3) break;
    }
    return out;
  }

  /* « Ça dépasse ici » : juste à l'extérieur de chaque bord d'un rectangle tracé à la main, on cherche de l'encre.
   * Les traits d'un tableau (une ligne sombre sur presque toute la longueur) ne comptent pas : ce n'est pas de l'écriture. */
  function encreDansBande(p, b, vertical, cache) {
    const px = pixelsDe(p, b.x, b.y, b.x + b.w, b.y + b.h);
    if (!px) return false;
    const { X0, Y0, W, H, lum } = px;
    const n1 = vertical ? W : H, n2 = vertical ? H : W; // n1 : travers la bande, n2 : le long du bord
    let encre = 0;
    for (let a = 0; a < n1; a++) {
      let s = 0;
      for (let c = 0; c < n2; c++) { const x = vertical ? a : c, y = vertical ? c : a; if (lum[y * W + x] < 140 && !cache(X0 + x + 0.5, Y0 + y + 0.5)) s++; }
      if (s / n2 > 0.6) continue; // un trait de tableau
      encre += s;
    }
    return encre >= Math.max(6, n1 * n2 * 0.02);
  }
  function bordsQuiDepassent(p, cache) {
    const out = [];
    const e = Math.max(3, Math.round(Math.min(p.img.width, p.img.height) * 0.004));
    p.strokes.forEach((st) => {
      if (st.kind !== "rect" || st.w < 6 || st.h < 6) return;
      const cotes = [
        ["g", { x: st.x - e, y: st.y, w: e, h: st.h }, true], ["d", { x: st.x + st.w, y: st.y, w: e, h: st.h }, true],
        ["h", { x: st.x, y: st.y - e, w: st.w, h: e }, false], ["b", { x: st.x, y: st.y + st.h, w: st.w, h: e }, false],
      ];
      for (const [cote, bande, vertical] of cotes) {
        if (bande.x < 0 || bande.y < 0 || bande.x + bande.w > p.img.width || bande.y + bande.h > p.img.height) continue;
        if (encreDansBande(p, bande, vertical, cache)) out.push({ st, cote, bande: { x: bande.x - e, y: bande.y - e, w: bande.w + 2 * e, h: bande.h + 2 * e } });
      }
    });
    return out.slice(0, 12);
  }
  // Élargir : le bord avance jusqu'à ce qu'il n'y ait plus d'encre juste derrière (au plus de quelques lettres).
  function elargir(p, d) {
    const st = d.st, e = Math.max(3, Math.round(Math.min(p.img.width, p.img.height) * 0.004));
    const avant = { x: st.x, y: st.y, w: st.w, h: st.h };
    const cache = couvert(p);
    for (let i = 0; i < 60; i++) {
      const b = d.cote === "g" ? { x: st.x - e, y: st.y, w: e, h: st.h } : d.cote === "d" ? { x: st.x + st.w, y: st.y, w: e, h: st.h }
        : d.cote === "h" ? { x: st.x, y: st.y - e, w: st.w, h: e } : { x: st.x, y: st.y + st.h, w: st.w, h: e };
      if (b.x < 0 || b.y < 0 || b.x + b.w > p.img.width || b.y + b.h > p.img.height) break;
      if (!encreDansBande(p, b, d.cote === "g" || d.cote === "d", cache)) break;
      if (d.cote === "g") { st.x -= e; st.w += e; } else if (d.cote === "d") st.w += e; else if (d.cote === "h") { st.y -= e; st.h += e; } else st.h += e;
    }
    // un peu de marge, pour couvrir le bord des lettres
    if (d.cote === "g") { st.x -= e; st.w += e; } else if (d.cote === "d") st.w += e; else if (d.cote === "h") { st.y -= e; st.h += e; } else st.h += e;
    st.moy = null;
    history.push({ type: "resize", page: p, item: st, avant });
  }

  // Les combinaisons qui trahissent : un code postal, un âge, le sexe, une information de santé.
  const COMBINAISON = [
    { cat: "un code postal", re: /\b(?:[A-Z]{1,2}-)?\d{4,5}\s+[A-ZÀ-Ý][a-zà-ÿ'’-]{2,}/g },
    { cat: "un âge ou une date de naissance", re: /\b\d{1,3}\s?(?:ans|years?|Jahre)\b|\b(?:âge|age|alter)\s*:?\s*\d{1,3}\b|\b(?:née?|naissance|geboren|born)\b/gi },
    { cat: "une situation professionnelle", re: /\b(?:chômage|chomage|chômeu(?:r|se)|sans emploi|demandeu(?:r|se) d'emploi|licencié(?:e)?|licenciement|en recherche d'emploi|arbeitslos)/gi },
    { cat: "le sexe", re: /\b(?:homme|femme|masculin|féminin|feminin|männlich|weiblich|male|female)\b|\bsexe\s*:?\s*[MFmf]\b/gi },
  ];

  async function analyserCerbere() {
    const items = [];
    const combinaison = new Map(); // catégorie -> { mots, texte }
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
        const dejaVus = new Set();
        chercher(detection, visibles).forEach((h) => { dejaVus.add(h.texte); ajouter({ tete: 3, label: "Encore visible : " + h.regle.type.toLowerCase(), texte: h.texte, rects: rectsDe(h.mots) }); });
        // Tête 3 bis : ce qui a la forme d'un identifiant (lettres et chiffres mêlés, groupes de chiffres…)
        if (visibles.length) {
          let raw = ""; const rr = [];
          visibles.forEach((w, i) => { if (i) raw += " "; rr.push([raw.length, raw.length + w.text.length]); raw += w.text; });
          for (const c of K.candidatsIdentifiant(raw)) {
            if (dejaVus.has(c.valeur) || [...vu].some((v) => v.endsWith("|" + c.valeur))) continue;
            const mots = visibles.filter((w, i) => rr[i][0] < c.fin && rr[i][1] > c.debut);
            if (mots.length) ajouter({ tete: 3, label: "Ressemble à un identifiant", texte: c.valeur, rects: rectsDe(mots) });
          }
          // Les combinaisons qui trahissent
          for (const g of COMBINAISON) {
            g.re.lastIndex = 0; let m;
            while ((m = g.re.exec(raw))) {
              const mots = visibles.filter((w, i) => rr[i][0] < m.index + m[0].length && rr[i][1] > m.index);
              if (!mots.length) continue;
              if (!combinaison.has(g.cat)) combinaison.set(g.cat, { texte: m[0].trim(), mots: [] });
              combinaison.get(g.cat).mots.push(...mots);
            }
          }
        }
        // Mots mal lus, hors des bords des zones masquées : le moteur a vu quelque chose sans être sûr de quoi.
        const malLus = line.words.filter((w) => w.conf != null && w.conf < 60 && /[A-Za-z0-9].*[A-Za-z0-9]/.test(w.text) &&
          !presDuMasque(cache, w.bbox));
        if (malLus.length) ajouter({ tete: 4, label: "Lecture incertaine ici", texte: "écriture difficile à lire", rects: rectsDe(malLus), nonLu: true });
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
              if (s.sante) {
                if (!combinaison.has("une information de santé")) combinaison.set("une information de santé", { texte: s.mot, mots: [] });
                combinaison.get("une information de santé").mots.push(...mots);
              }
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
      // Tête 4 : écriture que la lecture n'a pas su lire du tout
      try {
        zonesSansTexte(p, cache).forEach((r) => ajouter({ tete: 4, label: "Écriture non lue ici", texte: "texte trop petit, flou, ou manuscrit", rects: [r], nonLu: true }));
      } catch (e) { /* analyse impossible sur cette image */ }
      // Tête 1 ter : une signature manuscrite (au choix : la masquer ou la laisser)
      try { signatures(p, cache).forEach((r) => ajouter({ tete: 1, label: "Signature manuscrite ici", texte: "une signature peut faire reconnaître une personne", rects: [r] })); } catch (e) {}
      // Tête 3 ter : de l'encre qui touche le bord d'un rectangle tracé à la main (un mot qui continue sous le noir)
      try { bordsQuiDepassent(p, cache).forEach((d) => ajouter({ tete: 3, label: "Ça dépasse ici", texte: "de l'écriture touche le bord du masque", rects: [d.bande], depasse: d })); } catch (e) {}
      // Deux catégories ou plus encore visibles : on prévient, page par page.
      if (combinaison.size >= 2) {
        for (const [cat, v] of combinaison) items.push({ tete: 0, page: pi, label: "Peut identifier avec le reste : " + cat, texte: v.texte, rects: rectsDe(v.mots), combinaison: true });
      }
      combinaison.clear();
    }
    return items.sort((a, b) => a.tete - b.tete);
  }

  function afficherCerbere() {
    const ul = $("cerbereList");
    ul.textContent = "";
    const restants = cerbereItems.filter((it) => !it.fait);
    const nl = restants.filter((it) => it.nonLu).length;
    $("cerbereIntro").textContent = (balayageInfo ? balayageInfo + " " : "") + (restants.length
      ? `${restants.length} point${restants.length > 1 ? "s" : ""} à vérifier dans ce qui reste visible.` +
        (nl && !strict ? ` Dont ${nl} zone${nl > 1 ? "s" : ""} d'écriture non lue${nl > 1 ? "s" : ""}, en orange sur l'image : ${nl > 1 ? "elles seraient" : "elle serait"} à vérifier au niveau Strict.` : "")
      : "Rien à signaler. Vous pouvez envoyer.");
    $("cerbereAlerte").hidden = !restants.some((it) => it.combinaison);
    $("cerbereBalayage").hidden = strict;
    S.orange = restants.filter((it) => it.nonLu);
    render();
    $("cerbereSend").textContent = strict ? "Aperçu final" : (restants.length ? "Envoyer quand même" : "Envoyer");
    $("cerbereSend").hidden = strict && restants.length > 0; // en mode strict : tout traiter d'abord
    $("cerbereStrictNote").hidden = !(strict && restants.length > 0);
    // La mention qui partira avec le document, avant l'envoi et pas après.
    const men = $("cerbereMention"); men.textContent = "";
    if ($("optMask").checked) {
      men.append(document.createTextNode(avecMention() ? `Ce document portera en bas la mention « ${texteMention()} ».` : "Ce document partira sans mention."));
      if (strict) {
        const b = document.createElement("button"); b.type = "button"; b.className = "btn small";
        b.textContent = avecMention() ? "La retirer" : "La remettre";
        b.addEventListener("click", () => { $("optMention").checked = !$("optMention").checked; changed(); cerbereOk = -1; afficherCerbere(); });
        men.append(b);
      } else men.append(document.createTextNode(" Seul le niveau Strict permet de la retirer."));
    }
    // Trois points à la fois : la photo garde les deux tiers de l'écran. Les suivants arrivent quand un point est traité.
    restants.slice(0, 3).forEach((it) => {
      const li = document.createElement("li");
      li.className = "cerbere-item" + (it.nonLu ? " non-lu" : "");
      const t = document.createElement("button");
      t.type = "button"; t.className = "cerbere-voir";
      const l = document.createElement("strong"); l.textContent = it.label;
      const v = document.createElement("span"); v.textContent = "« " + it.texte + " »" + (S.pages.length > 1 ? ` · page ${it.page + 1}` : "");
      t.append(l, v);
      // Un toucher : l'image montre le point. Deux touchers : il reste seul en bas.
      t.addEventListener("click", () => {
        const now = performance.now();
        if (dernierClic.it === it && now - dernierClic.t < 450) { dernierClic = {}; modeUn(it); return; }
        dernierClic = { it, t: now };
        montrer(it);
      });
      const m = document.createElement("button"); m.type = "button"; m.className = "btn small dark"; m.textContent = it.depasse ? "Élargir" : "Masquer";
      m.addEventListener("click", () => { traiter(it, true); afficherCerbere(); });
      const g = document.createElement("button"); g.type = "button"; g.className = "btn small"; g.textContent = "Laisser";
      g.addEventListener("click", () => { traiter(it, false); afficherCerbere(); });
      const act = document.createElement("div"); act.className = "cerbere-act"; act.append(m, g);
      li.append(t, act);
      ul.append(li);
    });
    if (restants.length > 3) {
      const li = document.createElement("li"); li.className = "cerbere-plus";
      li.textContent = `+ ${restants.length - 3} autre${restants.length - 3 > 1 ? "s" : ""} point${restants.length - 3 > 1 ? "s" : ""}, juste après`;
      ul.append(li);
    }
  }
  let dernierClic = {};
  function traiter(it, masquer) {
    const p = S.pages[it.page];
    if (masquer) { if (it.depasse) elargir(p, it.depasse); else it.rects.forEach((r) => maskRect(p, r)); }
    it.fait = true; S.flash = null;
    if (masquer) afterEdit(); else render();
  }
  // Un seul point en bas : Masquer, Laisser, ou la flèche en haut à gauche pour revenir à la liste.
  function modeUn(it) {
    S.rbfUn = it;
    $("cerbere").hidden = true; majPanneau();
    $("rbfUnLabel").textContent = it.label;
    $("rbfUnTexte").textContent = "« " + it.texte + " »" + (S.pages.length > 1 ? ` · page ${it.page + 1}` : "");
    $("rbfUnMasquer").textContent = it.depasse ? "Élargir" : "Masquer";
    $("rbfUn").hidden = false;
    $("work").classList.add("mode-un");
    $("undo").disabled = false; $("undo").setAttribute("aria-label", "Revenir à la liste");
    montrer(it);
  }
  function retourListe() {
    S.rbfUn = null;
    $("rbfUn").hidden = true;
    $("work").classList.remove("mode-un");
    $("undo").setAttribute("aria-label", "Annuler le dernier geste"); updateUndo();
    $("cerbere").hidden = false; majPanneau();
    afficherCerbere();
  }
  $("rbfUn").addEventListener("pointerdown", (e) => e.stopPropagation());
  $("rbfUnMasquer").addEventListener("click", () => { if (S.rbfUn) traiter(S.rbfUn, true); retourListe(); });
  $("rbfUnLaisser").addEventListener("click", () => { if (S.rbfUn) traiter(S.rbfUn, false); retourListe(); });

  // Montrer un point : l'image zoome dessus, dans la partie de l'écran qui reste visible (au-dessus de la liste).
  function montrer(it) {
    if (it.page !== S.cur) { S.cur = it.page; fitView(); updateUI(); }
    S.flash = { page: S.pages[it.page], rects: it.rects };
    const vr = vp.getBoundingClientRect();
    let haut = vr.height;
    for (const id of ["cerbere", "rbfUn"]) {
      const el = $(id);
      if (!el.hidden) { const r = el.getBoundingClientRect(); if (r.left < vr.left + vr.width / 2 && r.top > vr.top) haut = Math.min(haut, r.top - vr.top); }
    }
    const z = unionDe(it.rects);
    fitView();
    const s = Math.min(S.view.fit * 6, Math.max(S.view.fit * 1.2, Math.min((vr.width * 0.6) / Math.max(z.w, 1), (haut * 0.45) / Math.max(z.h, 1))));
    S.view.s = s; S.view.tx = vr.width / 2 - (z.x + z.w / 2) * s; S.view.ty = Math.max(40, haut / 2) - (z.y + z.h / 2) * s;
    applyView(); showFit();
    render();
  }

  // Remove Before Flight, niveau Strict (par défaut) : chaque point doit être traité, dernière relecture automatique,
  // puis l'aperçu final. Niveau Normal : la liste ne s'affiche que s'il reste quelque chose à vérifier.
  // Dans les deux niveaux, rien ne part sans l'aperçu final et la case d'autorisation cochée.
  let strict = true;
  try { strict = localStorage.getItem("kerckhoffs-strict") !== "0"; } catch (e) {}
  function majNiveau() {
    $("niveauStrict").checked = strict; $("niveauNormal").checked = !strict; $("optStrict").checked = strict;
    $("niveauNote").textContent = strict
      ? "Strict : chaque point vous est soumis (laisser ou masquer), Kerckhoffs fait une dernière relecture, puis l'aperçu final s'affiche avant l'envoi."
      : "Normal : la liste ne s'affiche que s'il reste quelque chose à vérifier, et la mention reste toujours en bas du document. L'aperçu final s'affiche aussi avant chaque envoi.";
    $("optMention").disabled = !strict;
    if (!strict) $("optMention").checked = true;
  }
  majNiveau();
  document.querySelectorAll('input[name="niveau"]').forEach((r) => r.addEventListener("change", () => {
    strict = r.value === "strict";
    try { localStorage.setItem("kerckhoffs-strict", strict ? "1" : "0"); } catch (e) {}
    majNiveau(); cerbereOk = -1; changed(); render();
  }));
  $("optMention").addEventListener("change", () => { changed(); });

  let balayageInfo = "", cerbereSansEnvoi = false;

  // Dernier balayage : tout ce qui a été masqué quelque part (par vous ou par Kerckhoffs) est cherché partout ailleurs.
  async function dernierBalayage() {
    if (busy) return [];
    const vus = new Set((S.balayage || []).map((t) => t.key));
    const ajout = [];
    const actifs = new Set(S.pages.flatMap((p) => p.boxes.filter((b) => b.active).map((b) => b.token)));
    for (const t of S.tokens.values()) {
      if (!actifs.has(t.token) || t.type === "DATE" || t.type === "ZONE") continue;
      const v = String(t.value).trim();
      if (v.length < 3) continue;
      const chiffres = v.replace(/\D/g, "");
      if (chiffres.length >= 6) {
        const r = numeroVersRegle(chiffres); r.id = "balayage-" + chiffres; r.type = t.type;
        if (!S.extra.some((x) => x.id === r.id)) S.extra.push(r);
        continue;
      }
      if (/\d/.test(v) || !K.motsACherche(v).length) continue;
      const key = t.type + "|" + norm(v);
      if (vus.has(key)) continue;
      vus.add(key); ajout.push({ type: t.type, value: v, key });
    }
    S.balayage = (S.balayage || []).concat(ajout);
    const avant = instantane();
    await detectPages(S.pages, () => "");
    return nouveaux(avant);
  }
  $("cerbereBalayage").addEventListener("click", async () => {
    $("cerbereBalayage").disabled = true;
    const items = await dernierBalayage();
    balayageInfo = items.length ? `Dernier balayage : ${items.length} élément${items.length > 1 ? "s" : ""} de plus masqué${items.length > 1 ? "s" : ""}.` : "Dernier balayage : rien de nouveau.";
    try { cerbereItems = await analyserCerbere(); } catch (e) {}
    $("cerbereBalayage").disabled = false;
    afficherCerbere();
    if (items.length) montrerTrouves(items, true);
  });

  async function avecCerbere(action, sansEnvoi) {
    cerbereSansEnvoi = !!sansEnvoi; balayageInfo = "";
    // Sans masquage, ou document déjà validé et inchangé : on envoie tout de suite, sans contrôle ni animation.
    if (!$("optMask").checked || (cerbereOk === S.version && !strict)) { if (cerbereSansEnvoi) return action(); ouvrirApercu(action); return; }
    let attendu = false;
    if (busy) { // lecture en cours : on attend qu'elle finisse, puis Cerbère vérifie
      attendu = true;
      setStatus("Lecture du texte en cours, le contrôle « Remove Before Flight » suit juste après…", true);
      while (busy) await new Promise((r) => setTimeout(r, 300));
    }
    const direct = !attendu && S.pages.every((p) => p.lines);
    // En mode strict, le dernier balayage est automatique.
    if (strict) {
      setStatus("Dernier balayage…", true);
      const nv = await dernierBalayage();
      balayageInfo = nv.length ? `Dernier balayage : ${nv.length} élément${nv.length > 1 ? "s" : ""} de plus masqué${nv.length > 1 ? "s" : ""}.` : "Dernier balayage : rien de nouveau.";
      if (nv.length) montrerTrouves(nv, true);
    }
    let items;
    try { setStatus("Vérification de ce qui reste visible…", true); items = await analyserCerbere(); }
    catch (e) { items = []; }
    setStatus("");
    if (!items.length && direct && !strict) {
      cerbereOk = S.version; render();
      if (sansEnvoi) { await action(); return; }
      setStatus("Remove Before Flight : rien à signaler, bon vol.");
      apresValidation(action);
      return;
    }
    cerbereItems = items; cerbereSuite = action;
    closeSheet();
    $("cerbere").hidden = false; // sans voile sombre : l'image reste visible au-dessus
    majPanneau();
    afficherCerbere();
  }
  function fermerCerbere() {
    $("cerbere").hidden = true; $("backdrop").hidden = true; S.flash = null; S.orange = null;
    S.rbfUn = null; $("rbfUn").hidden = true; $("work").classList.remove("mode-un"); updateUndo();
    majPanneau(); render();
  }
  $("cerbereBack").addEventListener("click", fermerCerbere);
  $("cerbereSend").addEventListener("click", () => {
    const suite = cerbereSuite;
    cerbereOk = S.version; fermerCerbere(); // fermerCerbere redessine : le filigrane disparaît
    if (cerbereSansEnvoi) { if (suite) suite(); return; }
    apresValidation(suite);
  });

  /* ---------------- le document part : les zones masquées tombent comme du sable, puis l'image envoyée se pose */
  let animOn = true;
  try { animOn = localStorage.getItem("kerckhoffs-animation") !== "0"; } catch (e) {}
  const reduireMouvements = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animationPossible = () => animOn && !reduireMouvements() && $("optMask").checked && !!page();
  function majAnim() { $("optAnim").checked = animOn; }
  function choisirAnim(v) { animOn = v; try { localStorage.setItem("kerckhoffs-animation", v ? "1" : "0"); } catch (e) {} majAnim(); }
  majAnim();
  $("optAnim").addEventListener("change", () => choisirAnim($("optAnim").checked));

  // Après la validation : l'animation, puis un bouton « Envoyer » (le menu de partage du téléphone exige un toucher).
  let envolSuite = null;
  // Après la validation : toujours l'aperçu final, avec la case « J'ai vérifié, et je donne mon autorisation pour envoyer ».
  // Puis l'animation, et un bouton « Envoyer » (le menu de partage du téléphone exige un toucher).
  function apresValidation(suite) {
    if (!suite) return;
    ouvrirApercu(suite);
  }
  function envoyerApresApercu(suite) {
    if (!animationPossible()) { suite(); return; }
    jouerEnvol().then(() => {
      envolSuite = suite;
      const sansPartage = suite === doShare && fmt() !== "text" && !partageFichiers();
      $("envolEnvoyer").textContent = suite === doCopy ? "Copier" : suite === doSave || sansPartage ? "Enregistrer" : "Envoyer";
      $("envolCopier").hidden = !sansPartage;
      $("envolBar").hidden = false; $("envolPasser").hidden = true;
    });
  }
  function fermerEnvol() { $("envol").hidden = true; envolSuite = null; }
  $("envolRevenir").addEventListener("click", fermerEnvol);
  $("envolEnvoyer").addEventListener("click", () => { const s2 = envolSuite; fermerEnvol(); if (s2) s2(); });
  $("envolCopier").addEventListener("click", () => { fermerEnvol(); doCopy(); });

  function jouerEnvol() {
    return new Promise((fini) => {
      const p = page(), ov = $("envol"), cvE = $("envolCv");
      ov.hidden = false; $("envolBar").hidden = true; $("envolPasser").hidden = false;
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = ov.clientWidth, Ht = ov.clientHeight, H = Ht - 150;
      cvE.width = Math.round(W * dpr); cvE.height = Math.round(Ht * dpr);
      const x = cvE.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = Math.min((W - 24) / p.img.width, (H - 24) / p.img.height);
      const ox = (W - p.img.width * s) / 2, oy = 12 + (H - 24 - p.img.height * s) / 2, pw = p.img.width * s, ph = p.img.height * s;
      // L'image qui partira (la version publique), et l'original : au départ, on voit encore les données privées.
      const fin = avecBande(finalCanvas(p, true), true);
      const zones = [];
      const copie = (r) => ({ x: r.x, y: r.y, w: r.w, h: r.h });
      p.boxes.filter((b) => b.active).forEach((b) => (b.rects || [b]).forEach((r) => zones.push(copie(r))));
      p.strokes.forEach((st) => { zones.push(copie(cadreDe(st))); if (st.etiq) st.etiq.rects.forEach((r) => zones.push(copie(r))); });
      // Chaque zone se transforme à son tour, le coup de vent passant de gauche à droite.
      let xmin = Infinity, xmax = -Infinity;
      zones.forEach((r) => { if (r.x < xmin) xmin = r.x; if (r.x > xmax) xmax = r.x; });
      if (!zones.length) { xmin = 0; xmax = 1; }
      zones.forEach((r) => { r.dep = 0.7 + ((r.x - xmin) / (xmax - xmin + 1)) * 0.5; });
      // Les grains de sable : l'encre des lettres privées, qui tombe. Ils ne quittent jamais l'écran de l'appareil.
      const aire = zones.reduce((a, r) => a + Math.max(0, r.w) * Math.max(0, r.h), 0);
      const pas = Math.max(2, Math.sqrt(aire / 5000));
      const gx = [], gy = [], gc = [], gd = [];
      zones.forEach((r) => {
        const W = Math.max(1, Math.round(r.w / pas)), H = Math.max(1, Math.round(r.h / pas));
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const cx = c.getContext("2d", { willReadFrequently: true });
        try { cx.drawImage(p.img, r.x, r.y, r.w, r.h, 0, 0, W, H); } catch (e) { return; }
        const d = cx.getImageData(0, 0, W, H).data;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
          const o = (j * W + i) * 4;
          if (d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114 < 150) { gx.push(r.x + i * pas); gy.push(r.y + j * pas); gc.push(`rgb(${d[o]},${d[o + 1]},${d[o + 2]})`); gd.push(r.dep); }
        }
      });
      const n = Math.min(gx.length, 7000);
      const depart = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n);
      for (let i = 0; i < n; i++) { depart[i] = gd[i] + Math.random() * 0.18; vx[i] = 30 + Math.random() * 90; vy[i] = -Math.random() * 80; }
      const taille = Math.max(1.5, pas * s * 1.1), g = 1500, duree = 2.6;
      let t0 = null, finiTot = false;
      const finir = () => { if (finiTot) return; finiTot = true; dessiner(duree + 1); fini(); };
      const passer = () => finir();
      $("envolPasser").onclick = passer; cvE.onclick = passer;
      function dessiner(t) {
        x.clearRect(0, 0, W, Ht);
        // 1. l'original apparaît, avec ses données privées
        const aP = Math.min(1, Math.max(0, (t - 0.15) / 0.4));
        x.globalAlpha = aP; x.fillStyle = "#fff"; x.fillRect(ox, oy, pw, ph); x.drawImage(p.img, ox, oy, pw, ph);
        // 2. zone par zone, la version publique prend la place : le masque et son étiquette (NOM_1…)
        x.globalAlpha = 1;
        zones.forEach((r) => {
          const a = Math.min(1, Math.max(0, (t - r.dep) / 0.35));
          if (a <= 0) return;
          x.globalAlpha = a * aP;
          x.drawImage(fin, r.x, r.y, r.w, r.h, ox + r.x * s, oy + r.y * s, r.w * s, r.h * s);
        });
        // 3. les lettres tombent en sable
        x.globalAlpha = 1;
        for (let i = 0; i < n; i++) {
          const dt = t - depart[i];
          if (dt <= 0 || t < 0.15) continue;
          const X = ox + gx[i] * s + vx[i] * dt, Y = oy + gy[i] * s + vy[i] * dt + 0.5 * g * dt * dt;
          if (Y > Ht + 10) continue;
          x.fillStyle = gc[i];
          const tl = taille * Math.max(0.4, 1 - dt * 0.6);
          x.fillRect(X, Y, tl, tl);
        }
        // 4. la version publique se pose, avec sa mention
        const aF = Math.min(1, Math.max(0, (t - 1.95) / 0.5));
        if (aF > 0) { x.globalAlpha = aF; x.drawImage(fin, ox, oy, pw, (fin.height / fin.width) * pw); x.globalAlpha = 1; }
        // 0. le flash
        const aFl = Math.max(0, 1 - t / 0.3);
        if (aFl > 0) { x.globalAlpha = aFl; x.fillStyle = "#fff"; x.fillRect(0, 0, W, Ht); x.globalAlpha = 1; }
      }
      const pas2 = (ts) => {
        if (finiTot) return;
        if (t0 === null) t0 = ts;
        const t = (ts - t0) / 1000;
        dessiner(t);
        if (t >= duree) finir(); else requestAnimationFrame(pas2);
      };
      requestAnimationFrame(pas2);
    });
  }

  // Aperçu final (mode strict) : exactement ce qui va partir, page par page.
  let apercuSuite = null;
  function ouvrirApercu(suite) {
    apercuSuite = suite;
    const box = $("apercuPages");
    box.textContent = "";
    const masked = $("optMask").checked, f = fmt();
    if (f === "text") {
      // Envoi en texte : l'aperçu montre le texte exact qui partira.
      const pre = document.createElement("pre"); pre.className = "apercu-texte"; pre.textContent = "…"; box.append(pre);
      buildText(masked).then((t) => { pre.textContent = masked && avecMention() ? t + "\n\n— " + texteMention() : t; })
        .catch(() => { pre.textContent = "L'aperçu du texte a échoué. Revenez et réessayez."; });
    } else S.pages.forEach((p) => {
      let c = finalCanvas(p, masked);
      if (f === "light") c = lighten(c);
      c = avecBande(c, masked);
      const img = document.createElement("img");
      img.src = c.toDataURL("image/jpeg", 0.8);
      img.alt = "Aperçu de la page envoyée";
      box.append(img);
    });
    $("apercuOk").checked = false;
    $("apercuSend").disabled = true;
    $("apercuSend").textContent = animationPossible() ? "Valider" : suite === doCopy ? "Copier" : suite === doSave ? "Enregistrer" : "Envoyer";
    $("apercu").hidden = false;
  }
  $("apercuOk").addEventListener("change", () => { $("apercuSend").disabled = !$("apercuOk").checked; });
  $("apercuBack").addEventListener("click", () => { $("apercu").hidden = true; cerbereOk = -1; render(); });
  $("apercuSend").addEventListener("click", () => {
    $("apercu").hidden = true;
    const suite = apercuSuite; apercuSuite = null;
    if (suite) envoyerApresApercu(suite);
  });
  $("btnCerbere").addEventListener("click", () => { cerbereOk = -1; closeSheet(); avecCerbere(() => setStatus("Remove Before Flight : rien d'autre à signaler."), true); });

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
    openWork();
    $("tNames").value = "Jean Exemple";
    $("tAddr").value = "Rue du Lac 12, 1003 Lausanne";
    const p = demoPage();
    S.pages = [p]; S.cur = 0; changed();
    closeSheet();
    updateUI();
    requestAnimationFrame(() => { fitView(); render(); });
    detectPages([p]);
  });

  // Accueil : photographier tout de suite, ou importer un document (photo déjà prise, image ou PDF).
  $("goCam").addEventListener("click", () => { openWork(); ouvrirCamera(); });
  $("goImport").addEventListener("click", () => { openWork(); $("inFile").click(); });


  /* ------------------------- au premier lancement de chaque version : vérifier sa version */
  const VERSION_APP = "0.8.1";
  // Les deux seules adresses internet écrites dans le code de Kerckhoffs. Ce sont des liens à ouvrir dans votre navigateur :
  // l'application ne s'y connecte jamais (voir le verrou connect-src dans index.html).
  const ADRESSE_OFFICIELLE = "https://vernom-stc.github.io/Public/";
  const PAGE_VERSIONS = "https://github.com/Vernom-Stc/Public/blob/main/VERSIONS.md";
  (function verifierVersion() {
    $("verVersion").textContent = VERSION_APP;
    $("verOrigine").textContent = location.host || "fichier local";
    $("verOfficielle").textContent = ADRESSE_OFFICIELLE.replace(/^https:\/\//, "").replace(/\/$/, "") + " (version de test)";
    $("lienVersions").href = PAGE_VERSIONS;
    $("adrVersions").textContent = PAGE_VERSIONS.replace(/^https:\/\//, "").replace(/\/blob\/.*/, "");
    const qr = dessinerQR(PAGE_VERSIONS, "Liste officielle des versions");
    if (qr) $("qrVersions").appendChild(qr);
    let vue = null;
    try { vue = localStorage.getItem("kerckhoffs-version-vue"); } catch (e) {}
    if (vue !== VERSION_APP) $("verif").hidden = false;
    $("verifOk").addEventListener("click", () => {
      $("verif").hidden = true;
      try { localStorage.setItem("kerckhoffs-version-vue", VERSION_APP); } catch (e) {}
    });
    $("openVerif").addEventListener("click", () => { $("verif").hidden = false; });
    // Un message de l'auteur : vérifié ici, avec la clé publique inscrite dans verification.js, sans internet.
    $("msgVerifier").addEventListener("click", () => {
      const r = window.KerckhoffsVerification.verifierMessage($("msgSigne").value);
      const el = $("msgResultat");
      el.textContent = r.ok ? `Signé par l'auteur ✓ Ce message est authentique et n'a pas été modifié.` : `NON signé par l'auteur : ${r.raison}`;
      el.className = "empreinte " + (r.ok ? "ok" : "ko");
    });
  })();

  /* ------------------------------------------------------ hors ligne et mises à jour */
  // Le contrôle des signatures est dans verification.js. Ici, on ne fait que l'appeler et afficher le résultat.
  const V = window.KerckhoffsVerification;
  const CACHE_ACTUEL = "kerckhoffs-v" + VERSION_APP;
  // L'écran de vérification dit d'abord l'essentiel en une ligne ; les détails sont sous « En savoir plus ».
  function statut(texte, etat) { const el = $("verStatut"); el.textContent = texte; el.className = "verif-statut" + (etat ? " " + etat : ""); }
  const surAdresseOfficielle = () => {
    const o = new URL(ADRESSE_OFFICIELLE);
    return location.host === o.host && location.pathname.startsWith(o.pathname);
  };
  function afficherEmpreinte(r) {
    if (!r || r.absente) statut("Vérification possible dans un instant : rouvrez Kerckhoffs.");
    else if (!r.ok) statut("Attention : cette version n'est PAS signée par l'auteur. Ne l'utilisez pas.", "ko");
    else if (!surAdresseOfficielle()) statut("Signée par l'auteur ✓, mais ouverte depuis une autre adresse que l'adresse officielle. Voir « En savoir plus ».", "ko");
    else statut("Version officielle ✓ Signée par l'auteur.", "ok");
    const el = $("verEmpreinte");
    if (!r || r.absente) { el.textContent = "disponible une fois l'application gardée sur l'appareil : rouvrez-la dans un instant"; el.className = "empreinte"; return; }
    el.textContent = r.ok ? `${r.empreinte} · signée par l'auteur ✓` : `${r.empreinte ? r.empreinte + " · " : ""}NON signée : ${r.raison}`;
    el.className = "empreinte " + (r.ok ? "ok" : "ko");
  }
  const st = $("offlineState");
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    let enAttente = null, activationDemandee = false, migration = false;
    const examiner = async (reg) => {
      const w = reg.waiting;
      if (!w || w === enAttente || !navigator.serviceWorker.controller) return;
      enAttente = w;
      if (migration) return; // ancienne version d'essai en attente : on attend la version actuelle, demandée ci-dessous
      // La nouvelle version est déjà sur l'appareil, mise de côté. La version actuelle la vérifie avant tout.
      // Les vieilles copies (versions égales ou plus anciennes que la vôtre) sont effacées : seule une version plus récente peut être examinée.
      const num = (k) => k.replace("kerckhoffs-v", "").split(".").map(Number);
      const plusRecente = (x, y) => { for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
      const noms = [];
      for (const k of (await caches.keys()).filter((k) => k.startsWith("kerckhoffs-v") && k !== CACHE_ACTUEL)) {
        if (plusRecente(num(k), num(CACHE_ACTUEL))) noms.push(k); else await caches.delete(k);
      }
      let r = { ok: false, raison: "Ses fichiers sont introuvables." };
      for (const n of noms) { r = await V.verifierCopie(n); if (r.ok) break; }
      montrerBandeau(r, w);
    };
    navigator.serviceWorker.register("sw.js").then(async (reg) => {
      // Passage unique depuis les versions d'essai d'avant les signatures : elles se mettaient à jour toutes seules,
      // si bien que cette page est déjà plus récente que la copie gardée sur l'appareil. On demande alors la version actuelle,
      // qui sera vérifiée et proposée comme d'habitude.
      if (navigator.serviceWorker.controller && !(await caches.has(CACHE_ACTUEL))) {
        migration = true;
        const c = await caches.open("kerckhoffs-demande");
        await c.put(new URL("demande", document.baseURI).href, new Response(String(Date.now())));
        reg.update().catch(() => {});
      }
      examiner(reg);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (w) w.addEventListener("statechange", () => { if (w.state === "installed") { migration = false; examiner(reg); } });
      });
      // Regarder s'il y a une nouvelle version à l'ouverture, et à chaque retour dans l'application.
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
      return navigator.serviceWorker.ready;
    }).then(async () => {
      st.textContent = "Prêt pour le mode avion"; st.classList.add("ready");
      afficherEmpreinte(await V.verifierCopie(CACHE_ACTUEL));
    }).catch(() => { st.textContent = "Mode hors ligne indisponible sur ce navigateur"; afficherEmpreinte(null); });
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (activationDemandee) location.reload(); });
    // Une version plus récente existe en ligne : on le dit, sans rien installer.
    let dejaSignalee = null;
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (!e.data || e.data.type !== "version-disponible" || e.data.version === dejaSignalee || enAttente) return;
      dejaSignalee = e.data.version;
      bandeau(`Une version ${e.data.version} existe. Rien n'a changé chez vous : vous gardez celle que vous avez vérifiée.`,
        { action: "Aller la chercher", faire: chercherVersion });
    });
    async function chercherVersion() {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      if (!navigator.onLine) { bandeau("Pas de connexion. Aucun souci : votre version continue de fonctionner, exactement comme avant."); return; }
      bandeau("Recherche d'une nouvelle version…");
      // Le feu vert, valable dix minutes : sans lui, aucune nouvelle version n'accepte de s'installer (voir sw.js).
      const c = await caches.open("kerckhoffs-demande");
      await c.put(new URL("demande", document.baseURI).href, new Response(String(Date.now())));
      try { await reg.update(); } catch (e) { bandeau("Pas de connexion. Aucun souci : votre version continue de fonctionner, exactement comme avant."); return; }
      if (!reg.installing && !reg.waiting) bandeau(`Vous avez déjà la dernière version (${VERSION_APP}).`);
    }
    $("chercherMaj").addEventListener("click", chercherVersion);
    var activer = () => { if (!enAttente) return; activationDemandee = true; enAttente.postMessage("activer"); };
  } else if (FIGE) {
    st.textContent = "Version figée : sans internet, sans mise à jour"; st.classList.add("ready");
    $("installBloc").hidden = true; $("lienFige").hidden = true; $("chercherMaj").hidden = true;
    $("verOrigine").textContent = "ce fichier, sur votre appareil";
    $("verOfficielle").textContent = "aucune : cette version ne se connecte jamais";
    const el = $("verEmpreinte");
    el.textContent = "fichier figé : vérifiez-le avec sa signature, publiée dans VERSIONS.md";
    el.className = "empreinte";
    statut("Version figée : vérifiez ce fichier avec sa signature, publiée dans la liste officielle des versions.");
  } else {
    st.textContent = "Ouvrez Kerckhoffs depuis son adresse web pour l'utiliser hors ligne";
    afficherEmpreinte(null);
  }
  // Le bandeau du haut : une phrase, et au plus un bouton d'action.
  let actionBandeau = null;
  function bandeau(texte, o = {}) {
    const b = $("majBandeau");
    b.hidden = false;
    b.classList.toggle("danger", !!o.danger);
    $("majTexte").textContent = texte;
    $("majEmpreinte").hidden = !o.empreinte;
    $("majEmpreinte").textContent = o.empreinte ? "Numéro de référence : " + o.empreinte : "";
    actionBandeau = o.faire || null;
    $("majOk").hidden = !o.action;
    $("majOk").textContent = o.action || "";
    $("majPlusTard").textContent = o.action ? "Plus tard" : "Fermer";
  }
  $("majOk").addEventListener("click", () => { if (actionBandeau) actionBandeau(); });
  function montrerBandeau(r) {
    if (r.ok) {
      bandeau(`Version ${r.version} téléchargée et signée par l'auteur ✓ Elle ne remplacera la vôtre que si vous le décidez.` +
        (S.pages.length ? " Terminez d'abord votre travail : l'utiliser efface l'ardoise." : ""),
        { empreinte: r.empreinte, action: "Utiliser", faire: () => activer() });
    } else {
      bandeau("Attention : la version trouvée n'est PAS signée par l'auteur. Elle est refusée : gardez la vôtre et ne rouvrez pas Kerckhoffs " +
        "avant d'avoir vérifié l'adresse officielle, car le navigateur pourrait tout de même l'installer. (" + r.raison + ")",
        { danger: true, empreinte: r.empreinte });
    }
  }
  $("majPlusTard").addEventListener("click", () => { $("majBandeau").hidden = true; });

  /* ------------- ouvrir un document autrement : coller, glisser, capturer l'écran, recevoir depuis « Partager » */
  const ordinateur = !estTelephone();
  ["choixPC", "mColler", "mCapture", "emptyColler"].forEach((id) => { $(id).hidden = !ordinateur; });
  if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) { $("goCapture").hidden = true; $("mCapture").hidden = true; }
  const accepte = (f) => f && (/^image\//.test(f.type) || f.type === "application/pdf" || /\.pdf$/i.test(f.name || ""));
  function ouvrirFichiers(files) {
    files = files.filter(accepte);
    if (!files.length) return false;
    closeSheet();
    if ($("work").hidden) openWork();
    addFiles(files);
    return true;
  }
  // Ctrl+V : une capture d'écran collée s'ouvre directement. Rien n'est écrit sur le disque.
  document.addEventListener("paste", (e) => {
    const files = [...((e.clipboardData && e.clipboardData.files) || [])];
    if (files.some(accepte)) { e.preventDefault(); ouvrirFichiers(files); }
  });
  async function collerPressePapiers() {
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const it of items) for (const type of it.types) if (/^image\//.test(type)) files.push(new File([await it.getType(type)], "capture.png", { type }));
      if (ouvrirFichiers(files)) return;
      setStatus("Aucune image dans le presse-papiers. Faites d'abord une capture (Windows : Win+Maj+S ; Mac : Cmd+Maj+4).", true);
      if ($("work").hidden) alerteAccueil("Aucune image dans le presse-papiers. Faites d'abord une capture (Windows : Win+Maj+S ; Mac : Cmd+Maj+4), puis Ctrl+V.");
    } catch (e) {
      if ($("work").hidden) alerteAccueil("Appuyez simplement sur Ctrl+V (Cmd+V sur Mac) pour coller votre capture.");
      else setStatus("Appuyez simplement sur Ctrl+V (Cmd+V sur Mac) pour coller votre capture.", true);
    }
  }
  function alerteAccueil(texte) { bandeau(texte); }
  $("goColler").addEventListener("click", collerPressePapiers);
  $("mColler").addEventListener("click", () => { closeSheet(); collerPressePapiers(); });
  $("emptyColler").addEventListener("click", collerPressePapiers);
  // Glisser un fichier sur la page
  let glisse = 0;
  const avecFichiers = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  document.addEventListener("dragenter", (e) => { if (!avecFichiers(e)) return; e.preventDefault(); glisse++; if (!$("work").hidden) $("depot").hidden = false; });
  document.addEventListener("dragover", (e) => { if (avecFichiers(e)) e.preventDefault(); });
  document.addEventListener("dragleave", () => { glisse = Math.max(0, glisse - 1); if (!glisse) $("depot").hidden = true; });
  document.addEventListener("drop", (e) => {
    if (!avecFichiers(e)) return;
    e.preventDefault(); glisse = 0; $("depot").hidden = true;
    ouvrirFichiers([...e.dataTransfer.files]);
  });
  // Capturer l'écran : une fenêtre ou un onglet, choisi par vous. Une seule image est prise, puis la capture s'arrête.
  async function capturerEcran() {
    closeSheet();
    let flux2;
    try { flux2 = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); } catch (e) { return; }
    try {
      const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = flux2;
      try { await v.play(); } catch (e) {}
      for (let i = 0; i < 20 && !v.videoWidth; i++) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 250));
      const c = toCanvas(v, v.videoWidth, v.videoHeight);
      if ($("work").hidden) openWork();
      addPages([newPage(c, "capture")]);
    } finally { flux2.getTracks().forEach((tr) => tr.stop()); }
  }
  $("goCapture").addEventListener("click", capturerEcran);
  $("mCapture").addEventListener("click", capturerEcran);
  // « Partager » vers Kerckhoffs (Android, application installée) : le fichier est remis par le service worker,
  // gardé un instant sur l'appareil, ouvert ici, puis effacé aussitôt.
  async function recevoirPartage() {
    if (!/[?&]partage=1/.test(location.search)) return false;
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    const files = [];
    try {
      const c = await caches.open("kerckhoffs-partage");
      for (const req of await c.keys()) {
        const r = await c.match(req), b = await r.blob();
        files.push(new File([b], decodeURIComponent(r.headers.get("x-nom") || "document"), { type: b.type }));
      }
      await caches.delete("kerckhoffs-partage");
    } catch (e) {}
    return ouvrirFichiers(files);
  }

  /* ---------------------------------------- clavier et souris, sur un ordinateur */
  document.addEventListener("keydown", (e) => {
    if ($("work").hidden || !$("profil").hidden || !$("apercu").hidden || !$("envol").hidden) return;
    const champ = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !champ) { e.preventDefault(); $("undo").click(); return; }
    if (champ) return;
    if (e.key === " ") { espace = true; e.preventDefault(); return; }
    if (e.key === "Escape") {
      if (S.rbfUn) retourListe();
      else if (!$("sheet").hidden) closeSheet();
      else if (!$("cerbere").hidden) fermerCerbere();
      else if (!$("cherchePanel").hidden) $("chercheAnnuler").click();
      else if (!$("refbar").hidden) $("refCancel").click();
      else if (S.sel) $("selCancel").click();
      else if (S.cadre) $("cropCancel").click();
      else if (S.trouves) fermerTrouves();
      else if (tool !== outilBase) setTool(outilBase);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || !page()) return;
    const k = e.key.toLowerCase();
    const zoomer = (f) => { const r = vp.getBoundingClientRect(), m = [r.width / 2, r.height / 2], img = toImg(r.left + m[0], r.top + m[1]);
      const s = Math.min(S.view.fit * 12, Math.max(S.view.fit * 0.8, S.view.s * f)); S.view.s = s; S.view.tx = m[0] - img[0] * s; S.view.ty = m[1] - img[1] * s; applyView(); showFit(); };
    if (k === "d") setTool("brush");
    else if (k === "m") setTool("move");
    else if (k === "r") setTool("rect");
    else if (k === "g") setTool("erase");
    else if (k === "+" || k === "=") zoomer(1.25);
    else if (k === "-") zoomer(1 / 1.25);
    else if (k === "0") { fitView(); render(); }
    else return;
    e.preventDefault();
  });
  document.addEventListener("keyup", (e) => { if (e.key === " ") espace = false; });
  window.addEventListener("blur", () => { espace = false; });

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

  /* ---------------------------------------- au lancement : un document partagé, ou l'appareil photo tout de suite */
  (async function lancement() {
    if (await recevoirPartage()) { $("verif").hidden = true; return; }
    const direct = () => estTelephone() && $("optCamDirecte").checked && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && $("work").hidden;
    if ($("verif").hidden) { if (direct()) $("goCam").click(); }
    else $("verifOk").addEventListener("click", () => { if (direct()) $("goCam").click(); });
  })();
})();
