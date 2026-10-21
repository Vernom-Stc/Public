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

  const RULES = (window.KERCKHOFFS_RULES || []).slice().sort((a, b) => (a.id === "longnum") - (b.id === "longnum"));

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
    $("termsPanel").open = true;
    $("home").hidden = true;
    $("work").hidden = false;
    $("workTitle").textContent = mode === "quick" ? "Photo rapide" : "Dossier";
    $("termsPanel").hidden = mode === "quick";
    $("inFile").multiple = mode !== "quick";
    $("btnFile").textContent = mode === "quick" ? "Importer une image" : "Importer";
    $("inFile").accept = mode === "quick" ? "image/*" : "application/pdf,image/*";
    buildFormats();
    updateUI();
    window.scrollTo(0, 0);
  }

  function wipe() {
    S.pages = []; S.cur = 0; S.tokens = new Map(); S.counters = {}; S.cache = null; S.leaving = false;
    history.length = 0;
    ["tNames", "tAddr", "tOther"].forEach((id) => { $(id).value = ""; });
    $("optMask").checked = true;
    setStatus("");
    changed();
  }

  $("back").addEventListener("click", () => {
    if (S.pages.length && !S.leaving) {
      S.leaving = true;
      setStatus("Touchez encore « Accueil » pour tout effacer et revenir.");
      setTimeout(() => { S.leaving = false; }, 4000);
      return;
    }
    wipe();
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
    cv.hidden = !has;
    ["detect", "btnShare", "btnCopy", "btnSave", "brush"].forEach((id) => { $(id).disabled = !has; });
    updateUndo();
    $("pageInfo").textContent = S.pages.length > 1 ? `page ${S.cur + 1} / ${S.pages.length}` : "";
    $("btnCam").textContent = has && S.mode === "quick" ? "Nouvelle photo" : (has ? "Ajouter une photo" : "Prendre une photo");
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
          added.push(newPage(toCanvas(im, im.width, im.height), f.name || "photo"));
          if (im.close) im.close();
        }
      } catch (e) {
        setStatus(`Impossible de lire « ${f.name} ». Essayez une photo ou un PDF.`);
      }
    }
    if (!added.length) return;
    if (!S.pages.length) $("termsPanel").open = false;
    if (S.mode === "quick") { S.pages = [added[0]]; S.tokens = new Map(); S.counters = {}; S.cur = 0; }
    else { S.pages.push(...added); S.cur = S.pages.length - added.length; }
    changed();
    setStatus("");
    updateUI();
    requestAnimationFrame(() => { fitView(); render(); });
    if (S.mode === "folder") detectPages(added);
  }

  $("btnCam").addEventListener("click", () => $("inCam").click());
  $("btnFile").addEventListener("click", () => $("inFile").click());
  $("inCam").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
  $("inFile").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });

  /* -------------------------------------------------------- affichage */
  function applyView() {
    const v = S.view;
    cv.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
  }
  function fitView() {
    const p = page(); if (!p) return;
    cv.width = p.img.width; cv.height = p.img.height;
    const r = $("viewport").getBoundingClientRect();
    const s = Math.min(r.width / p.img.width, r.height / p.img.height);
    S.view = { s, tx: (r.width - p.img.width * s) / 2, ty: (r.height - p.img.height * s) / 2, fit: s };
    applyView();
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
    c.save();
    if (b.active) {
      c.fillStyle = "#000"; c.fillRect(b.x, b.y, b.w, b.h);
      const fs = Math.max(9, Math.min(b.h * 0.6, b.w / (b.token.length * 0.62)));
      c.fillStyle = "#fff"; c.font = `600 ${fs}px ui-monospace, Menlo, Consolas, monospace`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(b.token, b.x + b.w / 2, b.y + b.h / 2, b.w - 4);
    } else if (!final) {
      c.setLineDash([10, 6]); c.lineWidth = Math.max(2, cv.width / 600); c.strokeStyle = "#002366";
      c.strokeRect(b.x, b.y, b.w, b.h);
    }
    if (!final && b.active && b.flag) {
      c.lineWidth = Math.max(3, cv.width / 400); c.strokeStyle = "#e08a1e"; c.strokeRect(b.x, b.y, b.w, b.h);
    }
    c.restore();
  }

  function paint(c, p, masked, final) {
    c.drawImage(p.img, 0, 0);
    if (!masked) return;
    p.strokes.forEach((st) => strokePath(c, st));
    p.boxes.forEach((b) => drawBox(c, b, final));
  }
  function render() { const p = page(); if (p) paint(ctx, p, true, false); }

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
    $("brushWrap").hidden = tool !== "brush";
    const hints = {
      brush: "Un doigt : effacer au pinceau. Deux doigts : zoomer et déplacer.",
      rect: "Glissez en diagonale : toute la zone devient noire. Idéal pour une ligne de texte ou un visage.",
      erase: "Touchez un trait ou un rectangle pour l'enlever. Touchez une zone détectée pour la démasquer.",
    };
    $("toolsHint").textContent = hints[tool];
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
  const hitBox = (p, x, y) => [...p.boxes].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);

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
      if (tool === "brush") draft = { kind: "line", w: brushW(), pts: [pt] };
      else if (tool === "rect") draft = { kind: "rect", x0: pt[0], y0: pt[1], x: pt[0], y: pt[1], w: 0, h: 0 };
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
      applyView();
      return;
    }
    if (!draft) return;
    if (!moved && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) moved = true;
    if (!moved) return;
    const pt = toImg(e.clientX, e.clientY);
    if (draft.kind === "line") {
      const last = draft.pts[draft.pts.length - 1];
      draft.pts.push(pt);
      strokePath(ctx, { kind: "line", w: draft.w, pts: [last, pt] });
    } else if (draft.kind === "rect") {
      draft.x = Math.min(draft.x0, pt[0]); draft.y = Math.min(draft.y0, pt[1]);
      draft.w = Math.abs(pt[0] - draft.x0); draft.h = Math.abs(pt[1] - draft.y0);
      render();
      ctx.save(); ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(draft.x, draft.y, draft.w, draft.h); ctx.restore();
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
    if (!moved || (d.kind === "rect" && (d.w < 4 || d.h < 4))) {
      // Un simple toucher sur une zone détectée la masque ou la démasque.
      const [x, y] = d.kind === "line" ? d.pts[0] : [d.x0, d.y0];
      const hit = hitBox(p, x, y);
      if (hit) { toggleBox(p, hit); afterEdit(); return; }
      if (d.kind === "rect") { render(); return; }
    }
    const item = d.kind === "rect" ? { kind: "rect", x: d.x, y: d.y, w: d.w, h: d.h } : d;
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
    applyView();
  }, { passive: false });
  window.addEventListener("resize", () => { if (page()) { fitView(); render(); } });

  // Retour : annule la dernière action (trait, rectangle, gomme, zone démasquée).
  $("undo").addEventListener("click", () => {
    while (history.length) {
      const h = history.pop();
      if (!S.pages.includes(h.page)) continue;
      if (h.type === "add") { const i = h.page.strokes.indexOf(h.item); if (i >= 0) h.page.strokes.splice(i, 1); }
      else if (h.type === "remove") h.page.strokes.splice(Math.min(h.index, h.page.strokes.length), 0, h.item);
      else if (h.type === "toggle") h.item.active = !h.item.active;
      const pi = S.pages.indexOf(h.page);
      if (pi !== S.cur) { S.cur = pi; fitView(); updateUI(); }
      break;
    }
    afterEdit();
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

  async function ocr(p) {
    if (p.lines) return;
    const w = await getWorker();
    const { data } = await w.recognize(p.img);
    p.lines = linesOf(data).map((l) => ({ words: (l.words || []).filter((x) => x.text && x.text.trim()).map((x) => ({ text: x.text, bbox: x.bbox })) }));
  }

  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const isWordChar = (c) => !!c && /[a-z0-9]/i.test(c);

  function userTerms() {
    if (S.mode !== "folder") return [];
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
        const bb = idx.map((i) => words[i].bbox), pad = 4;
        const x0 = Math.min(...bb.map((b) => b.x0)) - pad, y0 = Math.min(...bb.map((b) => b.y0)) - pad;
        const x1 = Math.max(...bb.map((b) => b.x1)) + pad, y1 = Math.max(...bb.map((b) => b.y1)) + pad;
        const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, key, token: tokenFor(key, type, value), words: idx.map((i) => words[i]), active: true, flag };
        const was = previous.get(key + "@" + box.x + "," + box.y);
        if (was === false) box.active = false;
        p.boxes.push(box);
      };
      for (const r of RULES) {
        r.re.lastIndex = 0;
        let m;
        while ((m = r.re.exec(raw))) {
          const v = m[0].trim();
          const bad = r.check && !r.check(v);
          take(rr, m.index, m.index + m[0].length, r.type, v, r.type + "|" + v.replace(/[\s.]/g, "").toLowerCase(), bad ? "à relire" : null);
        }
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

  async function detectPages(list) {
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
      setStatus(n ? `${n} zone${n > 1 ? "s" : ""} masquée${n > 1 ? "s" : ""} automatiquement.${flagged ? ` ${flagged} à relire (encadrée en orange).` : ""} Relisez et complétez au doigt.`
                  : (S.mode === "quick"
                      ? "Aucun numéro trouvé. En photo rapide, « Détecter » repère les numéros AVS, IBAN, téléphones et e-mails, pas les noms : effacez-les au doigt, ou utilisez le mode Dossier."
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
    const done = S.pages.filter((p) => p.lines);
    if (!done.length) return;
    S.tokens = new Map(); S.counters = {};
    done.forEach(detect); changed(); render(); updateUI();
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

  $("btnSave").addEventListener("click", async () => {
    try { save(await prepared()); } catch (e) { setStatus("L'export a échoué. Réessayez."); }
  });

  $("btnShare").addEventListener("click", async () => {
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
  });

  $("btnCopy").addEventListener("click", async () => {
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
  });

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
    $("termsPanel").open = false;
    updateUI();
    requestAnimationFrame(() => { fitView(); render(); });
    detectPages([p]);
  });

  $("goQuick").addEventListener("click", () => openWork("quick"));
  $("goFolder").addEventListener("click", () => openWork("folder"));

  /* ------------------------------------------------------ hors ligne */
  const st = $("offlineState");
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then(() => {
      st.textContent = "Prêt pour le mode avion"; st.classList.add("ready");
    }).catch(() => { st.textContent = "Mode hors ligne indisponible sur ce navigateur"; });
  } else {
    st.textContent = "Ouvrez Kerckhoffs depuis son adresse web pour l'utiliser hors ligne";
  }
})();
