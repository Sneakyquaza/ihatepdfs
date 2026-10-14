/**
 * Passes result files to the next tool ("continue with…").
 *
 * Stored in IndexedDB so they survive the full page load some tools need (see `Tool.fullPageLoad`)
 * and a refresh; File objects are structured-cloneable, nothing leaves the device. Entries are
 * consumed on arrival and expire after a few minutes. Falls back to module memory when IndexedDB
 * is unavailable (some private modes) — that path only survives client-side navigation.
 */
const DB_NAME = "ihp";
const STORE = "handoff";
const KEY = "pending";
const TTL_MS = 10 * 60 * 1000;

interface Entry {
  files: File[];
  at: number;
}

let memory: Entry | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Runs `fn` in a transaction and resolves with its request's result once the transaction commits. */
async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function handOff(files: File[]): Promise<void> {
  const entry: Entry = { files, at: Date.now() };
  try {
    await withStore("readwrite", (s) => s.put(entry, KEY));
    memory = null;
  } catch {
    memory = entry;
  }
}

let inflight: Promise<File[] | null> | null = null;

/**
 * Returns the pending files (if fresh) and removes them. Concurrent calls share one read, so React
 * StrictMode's double effect run can't consume the files in a call whose result is then discarded.
 */
export function takeHandOff(): Promise<File[] | null> {
  inflight ??= take().finally(() => setTimeout(() => (inflight = null), 0));
  return inflight;
}

async function take(): Promise<File[] | null> {
  let entry: Entry | undefined | null = memory;
  memory = null;
  if (!entry) {
    try {
      entry = await withStore<Entry | undefined>("readwrite", (s) => {
        const req = s.get(KEY);
        req.onsuccess = () => s.delete(KEY); // same transaction: read-and-consume is atomic
        return req;
      });
    } catch {
      return null;
    }
  }
  if (!entry || Date.now() - entry.at > TTL_MS || !entry.files?.length) return null;
  return entry.files;
}
