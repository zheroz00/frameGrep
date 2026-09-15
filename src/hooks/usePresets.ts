import { useState, useEffect, useRef, useMemo, useCallback, type ChangeEvent, type RefObject } from 'react';
import { PromptPreset, PresetCategory } from '../types';
import { DEFAULT_PRESETS } from '../constants/defaultPresets';
import { applyPresetState, createPresetState, parsePresetBackup } from '../domain/presets';
import { loadWorkspaceDirectory, setWorkspaceDirectory } from '../services/workspaceDirectory';

const STORAGE_KEY = 'fpv_presets';
const AUTO_BACKUP_KEY = 'fpv_auto_backup';
const LAST_BACKUP_KEY = 'fpv_last_backup';
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
  importInputRef: RefObject<HTMLInputElement | null>;
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
  handleImportPresets: (e: ChangeEvent<HTMLInputElement>) => Promise<{ imported: number; error?: string }>;
  loadProjectPreset: (presetId: string, presetInstruction: string) => void;
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
  const projectInstructionOverrideRef = useRef<string | null>(null);
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
      const storedHandle = await loadWorkspaceDirectory();
      if (storedHandle) {
        // Store for later reconnection on user click
        pendingHandleRef.current = storedHandle;
        setHasPendingHandle(true);
      }
    };

    checkForStoredHandle();
  }, [supportsFileSystemAccess]);

  // Auto-backup function - only writes silently to linked folder
  // allowDownloadFallback: true for manual "Backup Now", false for auto-backup
  const performBackup = useCallback(async (allowDownloadFallback = false) => {
    const presetsToBackup = presetsRef.current;
    if (presetsToBackup.length === 0) return;

    const handle = directoryHandleRef.current;

    // Auto-backup requires a linked folder (silent only)
    if (!handle && !allowDownloadFallback) {
      return; // No folder linked, skip auto-backup silently
    }

    const data = JSON.stringify(createPresetState(DEFAULT_PRESETS, presetsToBackup), null, 2);

    if (handle) {
      try {
        const fileHandle = await handle.getFileHandle('fpv-presets-auto-backup.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
      } catch (err) {
        console.error('Silent backup failed:', err);
        if (allowDownloadFallback) {
          triggerDownload(data, 'fpv-presets-auto-backup.json');
        }
        return; // Don't update timestamp on failure
      }
    } else if (allowDownloadFallback) {
      // Manual backup without folder - allow download
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
    setTimeout(() => URL.revokeObjectURL(url), 0);
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

  // Manual backup trigger - allows download fallback since user explicitly requested it
  const triggerBackupNow = useCallback(() => {
    if (backupTimeoutRef.current) {
      clearTimeout(backupTimeoutRef.current);
    }
    performBackup(true); // Allow download if no folder linked
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

  const loadStoredPresets = useCallback(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const state = parsePresetBackup(JSON.parse(saved), DEFAULT_PRESETS);
      setPresets(applyPresetState(DEFAULT_PRESETS, state));
    } else {
      setPresets(DEFAULT_PRESETS);
      safeLocalStorageSet(STORAGE_KEY, JSON.stringify(createPresetState(DEFAULT_PRESETS, DEFAULT_PRESETS)));
    }
  }, []);

  useEffect(() => {
    try { loadStoredPresets(); } catch { setPresets(DEFAULT_PRESETS); }
    const reload = () => { try { loadStoredPresets(); } catch { /* invalid imports are never stored */ } };
    window.addEventListener('framegrep:data-imported', reload);
    return () => window.removeEventListener('framegrep:data-imported', reload);
  }, [loadStoredPresets]);

  useEffect(() => () => {
    if (backupTimeoutRef.current) clearTimeout(backupTimeoutRef.current);
  }, []);

  // Sync state when active preset changes
  useEffect(() => {
    const active = presets.find(p => p.id === activePresetId);
    if (active) {
      setCurrentInstruction(projectInstructionOverrideRef.current ?? active.instruction);
      setCurrentMaxDuration(active.maxDuration || 6);
      projectInstructionOverrideRef.current = null;
    }
  }, [activePresetId, presets]);

  const loadProjectPreset = useCallback((presetId: string, presetInstruction: string) => {
    const targetPreset = presets.find(p => p.id === presetId) || presets[0];
    const nextInstruction = presetInstruction || targetPreset?.instruction || '';
    const nextDuration = targetPreset?.maxDuration || 6;

    projectInstructionOverrideRef.current = nextInstruction;

    if (!targetPreset) {
      setActiveCategory('custom');
      setCurrentInstruction(nextInstruction);
      setCurrentMaxDuration(nextDuration);
      projectInstructionOverrideRef.current = null;
      return;
    }

    setActiveCategory(targetPreset.category || 'custom');

    if (targetPreset.id === activePresetId) {
      setCurrentInstruction(nextInstruction);
      setCurrentMaxDuration(nextDuration);
      projectInstructionOverrideRef.current = null;
      return;
    }

    setActivePresetId(targetPreset.id);
  }, [activePresetId, presets]);

  // Disk persistence
  const syncToDisk = async (preset: PromptPreset, targetHandle = directoryHandle) => {
    if (!targetHandle) return;
    try {
      const fileName = `${preset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
      const fileHandle = await targetHandle.getFileHandle(fileName, { create: true });
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
      await setWorkspaceDirectory(handle);
      setHasPendingHandle(false);
      for (const p of presets) {
        await syncToDisk(p, handle);
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
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(createPresetState(DEFAULT_PRESETS, updated)));
    triggerAutoBackup();
  };

  const updateCurrentPresetDuration = (val: number) => {
    setCurrentMaxDuration(val);
    const updated = presets.map(p => p.id === activePresetId ? { ...p, maxDuration: val } : p);
    setPresets(updated);
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(createPresetState(DEFAULT_PRESETS, updated)));
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
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(createPresetState(DEFAULT_PRESETS, updated)));
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
        safeLocalStorageSet(STORAGE_KEY, JSON.stringify(createPresetState(DEFAULT_PRESETS, updated)));
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
      safeLocalStorageSet(STORAGE_KEY, JSON.stringify(createPresetState(DEFAULT_PRESETS, DEFAULT_PRESETS)));
      triggerAutoBackup();
    }
  });

  const handleImportPresets = async (e: ChangeEvent<HTMLInputElement>): Promise<{ imported: number; error?: string }> => {
    const file = e.target.files?.[0];
    if (!file) return { imported: 0 };
    try {
      const importedState = parsePresetBackup(JSON.parse(await file.text()), DEFAULT_PRESETS);
      const currentState = createPresetState(DEFAULT_PRESETS, presets);
      const existingIds = new Set(currentState.customPresets.map(preset => preset.id));
      const newCustom = importedState.customPresets.filter(preset => !existingIds.has(preset.id));
      const mergedState = {
        schemaVersion: 2 as const,
        overrides: { ...currentState.overrides, ...importedState.overrides },
        customPresets: [...currentState.customPresets, ...newCustom],
      };
      const merged = applyPresetState(DEFAULT_PRESETS, mergedState);
      setPresets(merged);
      safeLocalStorageSet(STORAGE_KEY, JSON.stringify(mergedState));
      triggerAutoBackup();
      return { imported: newCustom.length + Object.keys(importedState.overrides).length };
    } catch (error) {
      return { imported: 0, error: error instanceof Error ? error.message : 'Invalid preset file format.' };
    } finally {
      e.target.value = '';
    }
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
    loadProjectPreset,
    connectToLocalFolder,
    triggerBackupNow,
  };
}
