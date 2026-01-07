import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PromptPreset, PresetCategory } from '../types';
import { DEFAULT_PRESETS } from '../constants/defaultPresets';

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
  handleImportPresets: (e: React.ChangeEvent<HTMLInputElement>) => string | null;
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

  // Keep presetsRef in sync for use in callbacks
  useEffect(() => {
    presetsRef.current = presets;
  }, [presets]);

  const supportsFileSystemAccess = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  // Auto-backup function - downloads presets JSON
  const performBackup = useCallback(() => {
    const presetsToBackup = presetsRef.current;
    if (presetsToBackup.length === 0) return;

    const timestamp = new Date().toISOString();
    const data = JSON.stringify(presetsToBackup, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fpv-presets-auto-backup.json`;
    a.click();
    URL.revokeObjectURL(url);

    const timeStr = new Date().toLocaleString();
    setLastBackupTime(timeStr);
    localStorage.setItem(LAST_BACKUP_KEY, timeStr);
  }, []);

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
    try {
      // @ts-ignore - showDirectoryPicker may not be in types
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
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

  const handleImportPresets = (e: React.ChangeEvent<HTMLInputElement>): string | null => {
    const file = e.target.files?.[0];
    if (!file) return null;

    const reader = new FileReader();
    let error: string | null = null;

    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as PromptPreset[];
        const customOnly = imported.filter(p => !p.isDefault);
        const merged = [...presets, ...customOnly];
        const unique = merged.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        setPresets(unique);
        safeLocalStorageSet(STORAGE_KEY, JSON.stringify(unique));
      } catch {
        error = "Invalid preset file format.";
      }
    };
    reader.readAsText(file);
    return error;
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
