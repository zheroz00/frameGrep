const DB_NAME = 'fpv_editor_db';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'directoryHandle';

let currentHandle: FileSystemDirectoryHandle | null = null;
const listeners = new Set<(handle: FileSystemDirectoryHandle | null) => void>();

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
  };
});

export const getWorkspaceDirectory = (): FileSystemDirectoryHandle | null => currentHandle;

export const subscribeWorkspaceDirectory = (listener: (handle: FileSystemDirectoryHandle | null) => void): (() => void) => {
  listeners.add(listener);
  listener(currentHandle);
  return () => listeners.delete(listener);
};

export const setWorkspaceDirectory = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  currentHandle = handle;
  listeners.forEach(listener => listener(handle));
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

export const loadWorkspaceDirectory = async (): Promise<FileSystemDirectoryHandle | null> => {
  if (currentHandle) return currentHandle;
  try {
    const db = await openDatabase();
    const handle = await new Promise<FileSystemDirectoryHandle | null>(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    db.close();
    currentHandle = handle;
    listeners.forEach(listener => listener(handle));
    return handle;
  } catch {
    return null;
  }
};
