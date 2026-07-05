/**
 * Offline-first storage using IndexedDB.
 * All GIS features (waypoints, lines, polygons, tracks) are stored locally
 * first so the app works fully offline in the field. If a network + Firestore
 * session is available, features are mirrored to the cloud for backup/sync.
 */
const DB_NAME = "lao_field_gis";
const DB_VERSION = 1;
const STORE = "features";

const LocalStore = (() => {
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function saveFeature(feature) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(feature);
      tx.oncomplete = () => resolve(feature);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteFeature(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAllFeatures() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  return { saveFeature, deleteFeature, getAllFeatures };
})();

function uid() {
  return "f_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
