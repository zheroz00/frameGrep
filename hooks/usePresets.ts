import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PromptPreset, PresetCategory } from '../types';
import { DEFAULT_PRESETS } from '../constants/defaultPresets';

const STORAGE_KEY = 'fpv_presets';
const AUTO_BACKUP_KEY = 'fpv_auto_backup';
const LAST_BACKUP_KEY = 'fpv_last_backup';
const IDB_DB_NAME = 'fpv_editor_db';
const IDB_STORE_NAME = 'handles';
const IDB_HANDLE_KEY = 'directoryHandle';

// IndexedDB helpers for persisting FileSystemDirectoryHandle
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE_NAME);
    };
  });
};

const storeDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).put(handle, IDB_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getStoredDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const request = tx.objectStore(IDB_STORE_NAME).get(IDB_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

/** Safe localStorage write that handles quota errors */
const safeLocalStorageSet = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (e instanceof Error && e.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded. Delete some presets to save new ones.');
    }
    return false;
  }
};

export interface UsePresetsReturn {
  presets: PromptPreset[];
  filteredPresets: PromptPreset[];
  activeCategory: PresetCategory;
  activePresetId: string;
  currentInstruction: string;
  currentMaxDuration: number;
  newPresetName: string;
  isOptimizing: boolean;
  directoryHandle: FileSystemDirectoryHandle | null;
  hasPendingHandle: boolean; // True if there's a stored handle that needs user click to reconnect
  supportsFileSystemAccess: boolean;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  autoBackupEnabled: boolean;
  lastBackupTime: string | null;
  setActiveCategory: (category: PresetCategory) => void;
  setActivePresetId: (id: string) => void;
  setNewPresetName: (name: string) => void;
  setIsOptimizing: (val: boolean) => void;
  setAutoBackupEnabled: (enabled: boolean) => void;
  updateCurrentPresetInstruction: (instruction: string) => void;
  updateCurrentPresetDuration: (val: number) => void;
  savePreset: () => Promise<void>;
  deletePreset: (id: string) => { title: string; message: string; onConfirm: () => void } | null;
  resetToDefaults: () => { title: string; message: string; onConfirm: () => void };
  handleImportPresets: (e: React.ChangeEvent<HTMLInputElement>) => Promise<{ imported: number; error?: string }>;
  connectToLocalFolder: () => Promise<void>;
  triggerBackupNow: () => void;
}

export function usePresets(): UsePresetsReturn {
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('fpv');
  const [activePresetId, setActivePresetId] = useState('cinematic');
  const [currentInstruction, setCurrentInstruction] = useState('');
  const [currentMaxDuration, setCurrentMaxDuration] = useState(6);
  const [newPresetName, setNewPresetName] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [hasPendingHandle, setHasPendingHandle] = useState(false);
  const pendingHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState(() => {
    const saved = localStorage.getItem(AUTO_BACKUP_KEY);
    return saved === 'true';
  });
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(() => {
    return localStorage.getItem(LAST_BACKUP_KEY);
  });
  const importInputRef = useRef<HTMLInputElement>(null);
  const backupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presetsRef = useRef<PromptPreset[]>([]);
  const directoryHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Keep refs in sync for use in callbacks
  useEffect(() => {
    presetsRef.current = presets;
  }, [presets]);

  useEffect(() => {
    directoryHandleRef.current = directoryHandle;
  }, [directoryHandle]);

  const supportsFileSystemAccess = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  // Check for stored directory handle on mount (don't request permission - needs user click)
  useEffect(() => {
    if (!supportsFileSystemAccess) return;

    const checkForStoredHandle = async () => {
      const storedHandle = await getStoredDirectoryHandle();
      if (storedHandle) {
        // Store for later reconnection on user click
        pendingHandleRef.current = storedHandle;
        setHasPendingHandle(true);
      }
    };

    checkForStoredHandle();
  }, [supportsFileSystemAccess]);

  // Auto-backup function - writes to linked folder if available, otherwise downloads
  const performBackup = useCallback(async () => {
    const presetsToBackup = presetsRef.current;
    if (presetsToBackup.length === 0) return;

    const data = JSON.stringify(presetsToBackup, null, 2);
    const handle = directoryHandleRef.current;

    // If we have a linked folder, write silently
    if (handle) {
      try {
        const fileHandle = await handle.getFileHandle('fpv-presets-auto-backup.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
      } catch (err) {
        console.error('Silent backup failed, falling back to download:', err);
        // Fall through to download
        triggerDownload(data, 'fpv-presets-auto-backup.json');
      }
    } else {
      // No linked folder - trigger download (will show Save dialog on Windows)
      triggerDownload(data, 'fpv-presets-auto-backup.json');
    }

    const timeStr = new Date().toLocaleString();
    setLastBackupTime(timeStr);
    localStorage.setItem(LAST_BACKUP_KEY, timeStr);
  }, []);

  // Helper to trigger download
  const triggerDownload = (data: string, filename: string) => {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Debounced auto-backup trigger
  const triggerAutoBackup = useCallback(() => {
    if (!autoBackupEnabled) return;

    // Clear existing timeout
    if (backupTimeoutRef.current) {
      clearTimeout(backupTimeoutRef.current);
    }

    // Debounce: wait 30 seconds after last change before backing up
    backupTimeoutRef.current = setTimeout(() => {
      performBackup();
    }, 30000);
  }, [autoBackupEnabled, performBackup]);

  // Manual backup trigger
  const triggerBackupNow = useCallback(() => {
    if (backupTimeoutRef.current) {
      clearTimeout(backupTimeoutRef.current);
    }
    performBackup();
  }, [performBackup]);

  // Toggle auto-backup
  const setAutoBackupEnabled = useCallback((enabled: boolean) => {
    setAutoBackupEnabledState(enabled);
    localStorage.setItem(AUTO_BACKUP_KEY, String(enabled));
  }, []);

  // Filter presets by active category
  const filteredPresets = useMemo(() => {
    return presets.filter(p => (p.category || 'custom') === activeCategory);
  }, [presets, activeCategory]);

  // Load presets on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const customOnly = parsed.filter((p: PromptPreset) => !p.isDefault);
        setPresets([...DEFAULT_PRESETS, ...customOnly]);
      } catch {
        setPresets(DEFAULT_PRESETS);
      }
    } else {
      setPresets(DEFAULT_PRESETS);
      safeLocalStorageSet(STORAGE_KEY, JSON.stringify(DEFAULT_PRESETS));
    }
  }, []);

  // Sync state when active preset changes
  useEffect(() => {
    const active = presets.find(p => p.id === activePresetId);
    if (active) {
      setCurrentInstruction(active.instruction);
      setCurrentMaxDuration(active.maxDuration || 6);
    }
  }, [activePresetId, presets]);

  // Disk persistence
  const syncToDisk = async (preset: PromptPreset) => {
    if (!directoryHandle) return;
    try {
      const fileName = `${preset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
      const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      const diskContent = `CLIP_LIMIT: ${preset.maxDuration}s\n\n${preset.instruction}`;
      await writable.write(diskContent);
      await writable.close();
    } catch (err) {
      console.error("Failed to sync to disk:", err);
    }
  };

  const connectToLocalFolder = async () => {
    if (!supportsFileSystemAccess) return;

    // If we have a pending handle from a previous session, try to reconnect first
    if (pendingHandleRef.current) {
      try {
        // @ts-ignore - requestPermission may not be in types
        const permission = await pendingHandleRef.current.requestPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          setDirectoryHandle(pendingHandleRef.current);
          directoryHandleRef.current = pendingHandleRef.current;
          setHasPendingHandle(false);
          pendingHandleRef.current = null;
          return; // Successfully reconnected
        }
      } catch (err) {
        // Permission denied or handle invalid - fall through to show picker
        console.log('Reconnection failed, showing folder picker:', err);
        pendingHandleRef.current = null;
        setHasPendingHandle(false);
      }
    }

    // Show folder picker for new connection
    try {
      // @ts-ignore - showDirectoryPicker may not be in types
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
      directoryHandleRef.current = handle;
      // Persist handle to IndexedDB for restoration on reload
      await storeDirectoryHandle(handle);
      setHasPendingHandle(false);
      for (const p of presets) {
        await syncToDisk(p);
      }
    } catch (err) {
      // Silently ignore if user cancelled the dialog
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error("Folder selection failed:", err);
    }
  };

  const updateCurrentPresetInstruction = (instruction: string) => {
    setCurrentInstruction(instruction);
    const updated = presets.map(p => p.id === activePresetId ? { ...p, instruction } : p);
    setPresets(updated);
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(updated));
    triggerAutoBackup();
  };

  const updateCurrentPresetDuration = (val: number) => {
    setCurrentMaxDuration(val);
    const updated = presets.map(p => p.id === activePresetId ? { ...p, maxDuration: val } : p);
    setPresets(updated);
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(updated));
    triggerAutoBackup();
  };

  const savePreset = async () => {
    if (!newPresetName) return;
    const newPreset: PromptPreset = {
      id: Date.now().toString(),
      name: newPresetName,
      instruction: currentInstruction,
      maxDuration: currentMaxDuration,
      category: 'custom',
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    setActivePresetId(newPreset.id);
    setActiveCategory('custom'); // Switch to custom tab to show new preset
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(updated));
    setNewPresetName('');
    if (directoryHandle) await syncToDisk(newPreset);
    triggerAutoBackup();
  };

  const deletePreset = (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (preset?.isDefault) return null;

    return {
      title: 'Delete Preset',
      message: `Are you sure you want to delete "${preset?.name}"?`,
      onConfirm: () => {
        const updated = presets.filter(p => p.id !== id);
        setPresets(updated);
        if (activePresetId === id) setActivePresetId('cinematic');
        safeLocalStorageSet(STORAGE_KEY, JSON.stringify(updated));
        triggerAutoBackup();
      }
    };
  };

  const resetToDefaults = () => ({
    title: 'Reset Defaults',
    message: 'Restore all factory presets and remove custom prompts?',
    onConfirm: () => {
      setPresets(DEFAULT_PRESETS);
      setActivePresetId('cinematic');
      safeLocalStorageSet(STORAGE_KEY, JSON.stringify(DEFAULT_PRESETS));
      triggerAutoBackup();
    }
  });

  const handleImportPresets = async (e: React.ChangeEvent<HTMLInputElement>): Promise<{ imported: number; error?: string }> => {
    const file = e.target.files?.[0];
    if (!file) return { imported: 0 };

    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string) as PromptPreset[];
          const customOnly = imported.filter(p => !p.isDefault);

          // Track which ones are actually new (not already in presets by ID)
          const existingIds = new Set(presets.map(p => p.id));
          const newPresets = customOnly.filter(p => !existingIds.has(p.id));

          if (newPresets.length > 0) {
            const merged = [...presets, ...newPresets];
            setPresets(merged);
            safeLocalStorageSet(STORAGE_KEY, JSON.stringify(merged));
          }

          resolve({ imported: newPresets.length });
        } catch {
          resolve({ imported: 0, error: "Invalid preset file format." });
        }
      };

      reader.onerror = () => {
        resolve({ imported: 0, error: "Failed to read file." });
      };

      reader.readAsText(file);
    });
  };

  return {
    presets,
    filteredPresets,
    activeCategory,
    activePresetId,
    currentInstruction,
    currentMaxDuration,
    newPresetName,
    isOptimizing,
    directoryHandle,
    hasPendingHandle,
    supportsFileSystemAccess,
    importInputRef,
    autoBackupEnabled,
    lastBackupTime,
    setActiveCategory,
    setActivePresetId,
    setNewPresetName,
    setIsOptimizing,
    setAutoBackupEnabled,
    updateCurrentPresetInstruction,
    updateCurrentPresetDuration,
    savePreset,
    deletePreset,
    resetToDefaults,
    handleImportPresets,
    connectToLocalFolder,
    triggerBackupNow,
  };
}
