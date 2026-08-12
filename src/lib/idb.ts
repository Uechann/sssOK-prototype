/** 업로드된 원본/최적화 Blob 저장소.
 * 메타데이터는 localStorage, 실제 바이트는 IndexedDB에 둡니다. */

const DB_NAME = 'sssok';
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const blobStore = {
  put: (key: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, key)).catch(() => undefined),
  get: (key: string) => tx<Blob | undefined>('readonly', (s) => s.get(key)).catch(() => undefined),
  del: (key: string) => tx('readwrite', (s) => s.delete(key)).catch(() => undefined),
  keys: () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).catch(() => [] as IDBValidKey[]),
};
