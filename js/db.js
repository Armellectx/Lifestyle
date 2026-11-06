// Accès IndexedDB pour les notes.
const DB_NAME = "lifestyle-notes";
const DB_VERSION = 1;
const STORE = "notes";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("day", "day");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Lance une transaction et renvoie le résultat de la requête une fois la transaction terminée.
async function run(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function getAllNotes() {
  return run("readonly", (s) => s.getAll());
}

export function getNote(id) {
  return run("readonly", (s) => s.get(id));
}

export function putNote(note) {
  return run("readwrite", (s) => s.put(note));
}

export function deleteNote(id) {
  return run("readwrite", (s) => s.delete(id));
}

export async function findByDay(day) {
  const notes = await run("readonly", (s) => s.index("day").getAll(day));
  return notes[0];
}

// Fusionne une liste de notes : à id égal, la version la plus récente gagne.
export async function mergeNotes(incoming) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let added = 0;
    let updated = 0;
    for (const note of incoming) {
      const req = store.get(note.id);
      req.onsuccess = () => {
        const existing = req.result;
        if (!existing) {
          store.put(note);
          added++;
        } else if ((note.updatedAt || 0) > (existing.updatedAt || 0)) {
          store.put(note);
          updated++;
        }
      };
    }
    tx.oncomplete = () => resolve({ added, updated });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
