const DB_NAME = 'nanika_ghost_db';
const STORE_NAME = 'ghosts';
const KEY_LAST_GHOST = 'last_ghost';

export interface SavedGhost {
  id: string;
  name: string;
  buffer: ArrayBuffer;
  timestamp: number;
}

export const GhostStorageService = {
  openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  },

  async saveLastGhost(name: string, buffer: ArrayBuffer): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const data: SavedGhost = {
          id: KEY_LAST_GHOST,
          name,
          buffer,
          timestamp: Date.now(),
        };
        const request = store.put(data);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Failed to save ghost in IndexedDB:', e);
    }
  },

  async getLastGhost(): Promise<{ name: string; buffer: ArrayBuffer } | null> {
    try {
      const db = await this.openDB();
      return new Promise<{ name: string; buffer: ArrayBuffer } | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(KEY_LAST_GHOST);
        request.onsuccess = () => {
          const result = request.result as SavedGhost | undefined;
          if (result) {
            resolve({ name: result.name, buffer: result.buffer });
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Failed to get ghost from IndexedDB:', e);
      return null;
    }
  },

  async clearLastGhost(): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(KEY_LAST_GHOST);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Failed to clear ghost from IndexedDB:', e);
    }
  }
};
