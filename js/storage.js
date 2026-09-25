(function () {
  "use strict";

  const DB_NAME = "pulse-space-db";
  const DB_VERSION = 1;
  const SONGS = "songs";
  const PROFILE = "profile";

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SONGS)) db.createObjectStore(SONGS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(PROFILE)) db.createObjectStore(PROFILE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function tx(storeName, mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
  }

  const fallback = {
    get(key, defaultValue) {
      try {
        const value = localStorage.getItem("pulse-space-" + key);
        return value == null ? defaultValue : JSON.parse(value);
      } catch (_) { return defaultValue; }
    },
    set(key, value) {
      try { localStorage.setItem("pulse-space-" + key, JSON.stringify(value)); } catch (_) {}
    }
  };

  window.PulseStorage = {
    async listSongs() {
      try { return (await tx(SONGS, "readonly", s => s.getAll())) || []; }
      catch (_) { return []; }
    },
    async saveSong(song) {
      await tx(SONGS, "readwrite", s => s.put(song));
      return song;
    },
    async deleteSong(id) {
      await tx(SONGS, "readwrite", s => s.delete(id));
    },
    async getProfile() {
      try {
        const row = await tx(PROFILE, "readonly", s => s.get("main"));
        return row ? row.value : fallback.get("profile", null);
      } catch (_) { return fallback.get("profile", null); }
    },
    async saveProfile(value) {
      fallback.set("profile", value);
      try { await tx(PROFILE, "readwrite", s => s.put({ key: "main", value })); } catch (_) {}
    }
  };
}());
