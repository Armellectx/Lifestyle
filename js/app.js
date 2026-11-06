import { getAllNotes, putNote, deleteNote, findByDay, mergeNotes } from "./db.js";

const EXPORT_FORMAT = "lifestyle-notes";
const EXPORT_VERSION = 1;

const $ = (sel) => document.querySelector(sel);
const els = {
  app: $("#app"),
  list: $("#note-list"),
  empty: $("#list-empty"),
  search: $("#search"),
  newBtn: $("#new-note"),
  todayBtn: $("#today-note"),
  exportBtn: $("#export"),
  importBtn: $("#import"),
  importInput: $("#import-file"),
  installBtn: $("#install"),
  editor: $("#editor"),
  placeholder: $("#editor-placeholder"),
  title: $("#note-title"),
  content: $("#note-content"),
  meta: $("#note-meta"),
  status: $("#save-status"),
  deleteBtn: $("#delete-note"),
  backBtn: $("#back"),
  toast: $("#toast"),
};

let notes = [];
let current = null;
let saveTimer = null;

// ---------- Utilitaires ----------

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isBlank(note) {
  return !note.title.trim() && !note.content.trim();
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (els.toast.hidden = true), 2600);
}

// ---------- Liste ----------

async function loadNotes() {
  notes = await getAllNotes();
  sortNotes();
  renderList();
}

function sortNotes() {
  notes.sort((a, b) => b.updatedAt - a.updatedAt);
}

function renderList() {
  const q = els.search.value.trim().toLowerCase();
  const visible = q
    ? notes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    : notes;

  els.list.replaceChildren(
    ...visible.map((note) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "note-item";
      btn.dataset.id = note.id;
      if (current && current.id === note.id) btn.setAttribute("aria-current", "true");

      const title = document.createElement("span");
      title.className = "note-item-title";
      title.textContent = note.title.trim() || "Sans titre";

      const excerpt = document.createElement("span");
      excerpt.className = "note-item-excerpt";
      excerpt.textContent = note.content.trim().split("\n")[0] || "Aucun contenu";

      const date = document.createElement("span");
      date.className = "note-item-date";
      date.textContent = (note.day ? "📅 " : "") + dateFmt.format(note.updatedAt);

      btn.append(title, excerpt, date);
      li.append(btn);
      return li;
    })
  );

  els.empty.hidden = visible.length > 0;
  els.empty.textContent = q ? "Aucune note ne correspond à la recherche." : "Aucune note pour l’instant.";
}

// ---------- Éditeur ----------

async function openNote(note) {
  await flushSave();
  await discardIfBlank(current, note);

  current = note;
  els.title.value = note.title;
  els.content.value = note.content;
  els.placeholder.hidden = true;
  els.editor.hidden = false;
  els.app.classList.add("show-editor");
  updateMeta();
  setStatus("");
  renderList();
}

async function closeEditor() {
  await flushSave();
  await discardIfBlank(current, null);
  current = null;
  els.editor.hidden = true;
  els.placeholder.hidden = false;
  els.app.classList.remove("show-editor");
  renderList();
}

// Supprime une note vide quand on la quitte, pour ne pas encombrer la liste.
async function discardIfBlank(note, next) {
  if (!note || (next && next.id === note.id) || !isBlank(note) || note.day) return;
  await deleteNote(note.id);
  notes = notes.filter((n) => n.id !== note.id);
}

function updateMeta() {
  if (!current) return;
  const parts = [];
  if (current.day) parts.push("Note du jour");
  parts.push(`Créée le ${dateFmt.format(current.createdAt)}`);
  if (current.updatedAt !== current.createdAt) parts.push(`modifiée le ${dateFmt.format(current.updatedAt)}`);
  els.meta.textContent = parts.join(" · ");
}

function setStatus(text) {
  els.status.textContent = text;
}

function scheduleSave() {
  if (!current) return;
  current.title = els.title.value;
  current.content = els.content.value;
  current.updatedAt = Date.now();
  setStatus("Modification…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

async function save() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!current) return;
  try {
    await putNote({ ...current });
    sortNotes();
    renderList();
    updateMeta();
    setStatus("Enregistré");
  } catch (err) {
    console.error(err);
    setStatus("Erreur d’enregistrement");
  }
}

async function flushSave() {
  if (saveTimer) await save();
}

async function createNote({ title = "", day = null } = {}) {
  const now = Date.now();
  const note = { id: newId(), title, content: "", day, createdAt: now, updatedAt: now };
  await putNote(note);
  notes.unshift(note);
  await openNote(note);
  (title ? els.content : els.title).focus();
}

async function openToday() {
  const day = todayKey();
  const existing = await findByDay(day);
  if (existing) {
    const inList = notes.find((n) => n.id === existing.id) || existing;
    await openNote(inList);
    els.content.focus();
  } else {
    await createNote({ title: capitalize(dayFmt.format(new Date())), day });
  }
}

async function removeCurrent() {
  if (!current) return;
  const label = current.title.trim() || "cette note";
  if (!confirm(`Supprimer « ${label} » ? Cette action est définitive.`)) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  await deleteNote(current.id);
  notes = notes.filter((n) => n.id !== current.id);
  current = null;
  await closeEditor();
  toast("Note supprimée");
}

// ---------- Export / import JSON ----------

async function exportJSON() {
  await flushSave();
  const all = await getAllNotes();
  const payload = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    count: all.length,
    notes: all.sort((a, b) => a.createdAt - b.createdAt),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `notes-${todayKey()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`${all.length} note${all.length > 1 ? "s" : ""} exportée${all.length > 1 ? "s" : ""}`);
}

function normalizeImported(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) return null;
  const toTime = (v) => {
    const t = typeof v === "number" ? v : Date.parse(v);
    return Number.isFinite(t) ? t : Date.now();
  };
  const createdAt = toTime(raw.createdAt);
  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : "",
    content: typeof raw.content === "string" ? raw.content : "",
    day: typeof raw.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? raw.day : null,
    createdAt,
    updatedAt: raw.updatedAt == null ? createdAt : toTime(raw.updatedAt),
  };
}

async function importJSON(file) {
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data && data.notes;
    if (!Array.isArray(list)) throw new Error("Format non reconnu");
    const valid = list.map(normalizeImported).filter(Boolean);
    if (!valid.length) throw new Error("Aucune note valide dans le fichier");

    await flushSave();
    const { added, updated } = await mergeNotes(valid);
    const openId = current && current.id;
    await loadNotes();
    if (openId) {
      const fresh = notes.find((n) => n.id === openId);
      if (fresh) {
        current = fresh;
        els.title.value = fresh.title;
        els.content.value = fresh.content;
        updateMeta();
      }
    }
    const skipped = valid.length - added - updated;
    toast(`Import : ${added} ajoutée(s), ${updated} mise(s) à jour, ${skipped} inchangée(s)`);
  } catch (err) {
    console.error(err);
    toast(`Import impossible : ${err.message}`);
  }
}

// ---------- Installation PWA ----------

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  els.installBtn.hidden = false;
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  els.installBtn.hidden = true;
});

els.installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.installBtn.hidden = true;
});

// ---------- Événements ----------

els.list.addEventListener("click", (e) => {
  const btn = e.target.closest(".note-item");
  if (!btn) return;
  const note = notes.find((n) => n.id === btn.dataset.id);
  if (note) openNote(note);
});

els.search.addEventListener("input", renderList);
els.newBtn.addEventListener("click", () => createNote());
els.todayBtn.addEventListener("click", openToday);
els.title.addEventListener("input", scheduleSave);
els.content.addEventListener("input", scheduleSave);
els.deleteBtn.addEventListener("click", removeCurrent);
els.backBtn.addEventListener("click", closeEditor);
els.exportBtn.addEventListener("click", exportJSON);
els.importBtn.addEventListener("click", () => els.importInput.click());
els.importInput.addEventListener("change", () => {
  const file = els.importInput.files[0];
  if (file) importJSON(file);
  els.importInput.value = "";
});

document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    flushSave();
  } else if (mod && e.altKey && e.key.toLowerCase() === "n") {
    e.preventDefault();
    createNote();
  } else if (e.key === "Escape" && current && els.app.classList.contains("show-editor")) {
    closeEditor();
  }
});

// Enregistre avant que l'onglet passe en arrière-plan (fermeture, changement d'app sur mobile).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSave();
});

// ---------- Démarrage ----------

async function init() {
  if (!("indexedDB" in window)) {
    toast("IndexedDB n’est pas disponible dans ce navigateur.");
    return;
  }
  await loadNotes();

  // Demande au navigateur de ne pas effacer les données en cas de manque d'espace.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("Service worker non enregistré", err));
  }

  if (new URLSearchParams(location.search).get("action") === "today") openToday();
}

init();
