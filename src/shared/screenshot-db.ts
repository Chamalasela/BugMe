const DB_NAME = 'BugMeDB';
const SCREENSHOT_STORE = 'screenshots';
const DB_VERSION = 1;

export interface ScreenshotRecord {
  id: string;
  bugId: string;
  dataUrl: string;
  url: string;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SCREENSHOT_STORE)) {
        const ss = db.createObjectStore(SCREENSHOT_STORE, { keyPath: 'id' });
        ss.createIndex('bugId', 'bugId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveScreenshot(record: ScreenshotRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCREENSHOT_STORE, 'readwrite');
    tx.objectStore(SCREENSHOT_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getScreenshots(bugId: string): Promise<ScreenshotRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCREENSHOT_STORE, 'readonly');
    const req = tx.objectStore(SCREENSHOT_STORE).index('bugId').getAll(bugId);
    req.onsuccess = () => resolve(req.result as ScreenshotRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteScreenshots(bugId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCREENSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SCREENSHOT_STORE);
    const req = store.index('bugId').getAllKeys(bugId);
    req.onsuccess = () => {
      for (const key of req.result) store.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
