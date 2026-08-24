/** Tiny IndexedDB key/value store — used for course assets (data URLs can exceed localStorage limits). */
const DB_NAME = "docsum-db";
const STORE = "kv";

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    };
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await withStore("readwrite", (s) => s.put(value, key));
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  return withStore<T | undefined>("readonly", (s) => s.get(key));
}
