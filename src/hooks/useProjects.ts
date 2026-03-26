import { useState, useEffect, useCallback, useRef } from 'react';
import { Project, ClipSegment, AnalysisProvider, SelectedMusicTrack } from '../types';

const STORAGE_KEY = 'fpv_projects';
const AUTO_BACKUP_KEY = 'fpv_projects_auto_backup';
const LAST_BACKUP_KEY = 'fpv_projects_last_backup';

// IndexedDB constants - shared with usePresets for directory handle
const IDB_DB_NAME = 'fpv_editor_db';
const IDB_STORE_NAME = 'handles';
const IDB_HANDLE_KEY = 'directoryHandle';

// Retrieve directory handle from IndexedDB (shared with usePresets)
const getStoredDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    return new Promise((resolve) => {
      const request = indexedDB.open(IDB_DB_NAME, 1);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(IDB_STORE_NAME, 'readonly');
        const getRequest = tx.objectStore(IDB_STORE_NAME).get(IDB_HANDLE_KEY);
        getRequest.onsuccess = () => resolve(getRequest.result || null);
        getRequest.onerror = () => resolve(null);
      };
      request.onupgradeneeded = () => {
        request.result.createObjectStore(IDB_STORE_NAME);
      };
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
      console.error('localStorage quota exceeded. Delete some projects to save new ones.');
    }
    return false;
  }
};

/** Generate unique project ID */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/** Generate default project name from filenames */
const generateProjectName = (filenames: string[]): string => {
  if (filenames.length === 0) return 'Untitled Project';
  if (filenames.length === 1) {
    // Remove extension and clean up filename
    return filenames[0].replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  }
  return `${filenames.length} Videos - ${new Date().toLocaleDateString()}`;
};

export interface ProjectMetadata {
  presetId: string;
  presetInstruction: string;
  provider: AnalysisProvider;
  selectedMusic?: SelectedMusicTrack | null;
}

export interface UseProjectsReturn {
  // State
  projects: Project[];
  currentProjectId: string | null;
  isLoading: boolean;
  autoBackupEnabled: boolean;
  lastBackupTime: string | null;

  // Actions
  createProject: (clips: ClipSegment[], videoFilenames: string[], metadata: ProjectMetadata, name?: string) => Project;
  updateProject: (id: string, clips: ClipSegment[], videoFilenames: string[], metadata: ProjectMetadata) => void;
  deleteProject: (id: string) => { title: string; message: string; onConfirm: () => void };
  renameProject: (id: string, name: string) => void;

  // Current project management
  setCurrentProjectId: (id: string | null) => void;
  getCurrentProject: () => Project | null;

  // Import/Export
  exportProject: (id: string) => void;
  exportAllProjects: () => void;
  importProjects: (file: File) => Promise<{ imported: number; errors: string[] }>;

  // Auto-backup
  setAutoBackupEnabled: (enabled: boolean) => void;
  triggerBackupNow: () => void;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState(() => {
    const saved = localStorage.getItem(AUTO_BACKUP_KEY);
    return saved === 'true';
  });
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(() => {
    return localStorage.getItem(LAST_BACKUP_KEY);
  });
  const projectsRef = useRef<Project[]>([]);
  const backupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const directoryHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Keep ref in sync
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // Retrieve directory handle from IndexedDB on mount (for silent backups)
  useEffect(() => {
    const loadHandle = async () => {
      const handle = await getStoredDirectoryHandle();
      if (handle) {
        try {
          // @ts-ignore - requestPermission may not be in types
          const permission = await handle.requestPermission({ mode: 'readwrite' });
          if (permission === 'granted') {
            directoryHandleRef.current = handle;
          }
        } catch {
          // Permission denied or handle invalid
        }
      }
    };
    loadHandle();
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

  // Auto-backup function - only writes silently to linked folder
  // allowDownloadFallback: true for manual "Backup Now", false for auto-backup
  const performBackup = useCallback(async (allowDownloadFallback = false) => {
    const projectsToBackup = projectsRef.current;
    if (projectsToBackup.length === 0) return;

    const handle = directoryHandleRef.current;

    // Auto-backup requires a linked folder (silent only)
    if (!handle && !allowDownloadFallback) {
      return; // No folder linked, skip auto-backup silently
    }

    const data = JSON.stringify(projectsToBackup, null, 2);

    if (handle) {
      try {
        const fileHandle = await handle.getFileHandle('fpv-projects-auto-backup.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
      } catch (err) {
        console.error('Silent backup failed:', err);
        if (allowDownloadFallback) {
          triggerDownload(data, 'fpv-projects-auto-backup.json');
        }
        return; // Don't update timestamp on failure
      }
    } else if (allowDownloadFallback) {
      // Manual backup without folder - allow download
      triggerDownload(data, 'fpv-projects-auto-backup.json');
    }

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

  // Load projects on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Project[];
        setProjects(parsed);
      } catch {
        console.error('Failed to parse saved projects');
        setProjects([]);
      }
    }
    setIsLoading(false);
  }, []);

  // Save to localStorage whenever projects change
  const saveToStorage = useCallback((updatedProjects: Project[]) => {
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(updatedProjects));
  }, []);

  // Create new project
  const createProject = useCallback((
    clips: ClipSegment[],
    videoFilenames: string[],
    metadata: ProjectMetadata,
    name?: string
  ): Project => {
    const now = new Date().toISOString();
    const newProject: Project = {
      id: generateId(),
      name: name || generateProjectName(videoFilenames),
      createdAt: now,
      updatedAt: now,
      clips,
      videoFilenames,
      presetId: metadata.presetId,
      presetInstruction: metadata.presetInstruction,
      provider: metadata.provider,
      selectedMusic: metadata.selectedMusic || undefined,
    };

    const updated = [newProject, ...projects];
    setProjects(updated);
    setCurrentProjectId(newProject.id);
    saveToStorage(updated);
    triggerAutoBackup();

    return newProject;
  }, [projects, saveToStorage, triggerAutoBackup]);

  // Update existing project's contents and saved metadata
  const updateProject = useCallback((
    id: string,
    clips: ClipSegment[],
    videoFilenames: string[],
    metadata: ProjectMetadata
  ) => {
    const updated = projects.map(p =>
      p.id === id
        ? {
            ...p,
            clips,
            videoFilenames,
            presetId: metadata.presetId,
            presetInstruction: metadata.presetInstruction,
            provider: metadata.provider,
            selectedMusic: metadata.selectedMusic || undefined,
            updatedAt: new Date().toISOString()
          }
        : p
    );
    setProjects(updated);
    saveToStorage(updated);
    triggerAutoBackup();
  }, [projects, saveToStorage, triggerAutoBackup]);

  // Delete project (returns confirmation dialog config)
  const deleteProject = useCallback((id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return { title: '', message: '', onConfirm: () => {} };

    return {
      title: 'Delete Project',
      message: `Are you sure you want to delete "${project.name}"? This cannot be undone.`,
      onConfirm: () => {
        const updated = projects.filter(p => p.id !== id);
        setProjects(updated);
        if (currentProjectId === id) {
          setCurrentProjectId(null);
        }
        saveToStorage(updated);
        triggerAutoBackup();
      }
    };
  }, [projects, currentProjectId, saveToStorage, triggerAutoBackup]);

  // Rename project
  const renameProject = useCallback((id: string, name: string) => {
    const updated = projects.map(p =>
      p.id === id
        ? { ...p, name, updatedAt: new Date().toISOString() }
        : p
    );
    setProjects(updated);
    saveToStorage(updated);
    triggerAutoBackup();
  }, [projects, saveToStorage, triggerAutoBackup]);

  // Get current project
  const getCurrentProject = useCallback((): Project | null => {
    if (!currentProjectId) return null;
    return projects.find(p => p.id === currentProjectId) || null;
  }, [currentProjectId, projects]);

  // Export single project as JSON
  const exportProject = useCallback((id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    const data = JSON.stringify(project, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [projects]);

  // Export all projects as JSON (manual export, dated filename)
  const exportAllProjects = useCallback(() => {
    if (projects.length === 0) return;

    const data = JSON.stringify(projects, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fpv-projects-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [projects]);

  // Import projects from JSON file
  const importProjects = useCallback(async (file: File): Promise<{ imported: number; errors: string[] }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      const errors: string[] = [];
      let imported = 0;

      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);

          // Handle single project or array of projects
          const projectsToImport: Project[] = Array.isArray(parsed) ? parsed : [parsed];

          // Validate and import
          const validProjects: Project[] = [];
          for (const p of projectsToImport) {
            if (!p.id || !p.name || !Array.isArray(p.clips)) {
              errors.push(`Invalid project format: ${p.name || 'unknown'}`);
              continue;
            }
            // Assign new ID to avoid conflicts
            validProjects.push({
              ...p,
              id: generateId(),
              updatedAt: new Date().toISOString(),
            });
            imported++;
          }

          if (validProjects.length > 0) {
            const updated = [...validProjects, ...projects];
            setProjects(updated);
            saveToStorage(updated);
            triggerAutoBackup();
          }

          resolve({ imported, errors });
        } catch (e) {
          errors.push('Failed to parse JSON file');
          resolve({ imported: 0, errors });
        }
      };

      reader.onerror = () => {
        resolve({ imported: 0, errors: ['Failed to read file'] });
      };

      reader.readAsText(file);
    });
  }, [projects, saveToStorage, triggerAutoBackup]);

  return {
    projects,
    currentProjectId,
    isLoading,
    autoBackupEnabled,
    lastBackupTime,
    createProject,
    updateProject,
    deleteProject,
    renameProject,
    setCurrentProjectId,
    getCurrentProject,
    exportProject,
    exportAllProjects,
    importProjects,
    setAutoBackupEnabled,
    triggerBackupNow,
  };
}
