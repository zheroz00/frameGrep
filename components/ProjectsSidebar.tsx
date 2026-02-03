import React, { useRef, useState } from 'react';
import {
  FolderOpen, X, Download, Upload, Save, Film, Clock, AlertCircle, CheckCircle2, HardDrive
} from 'lucide-react';
import { Project, ClipSegment, AnalysisProvider } from '../types';
import { UseProjectsReturn, ProjectMetadata } from '../hooks/useProjects';
import ProjectListItem from './projects/ProjectListItem';

interface ProjectsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  projects: UseProjectsReturn;
  // Current analysis state
  currentClips: ClipSegment[];
  videoFilenames: string[];
  hasUnsavedChanges: boolean;
  // Preset info for saving
  activePresetId: string;
  activePresetInstruction: string;
  provider: AnalysisProvider;
  // Callbacks
  onLoadProject: (project: Project) => void;
  onConfirmAction: (action: { title: string; message: string; onConfirm: () => void }) => void;
}

const ProjectsSidebar: React.FC<ProjectsSidebarProps> = ({
  isOpen,
  onClose,
  projects,
  currentClips,
  videoFilenames,
  hasUnsavedChanges,
  activePresetId,
  activePresetInstruction,
  provider,
  onLoadProject,
  onConfirmAction,
}) => {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleSaveNew = () => {
    if (currentClips.length === 0) return;

    const metadata: ProjectMetadata = {
      presetId: activePresetId,
      presetInstruction: activePresetInstruction,
      provider,
    };

    const name = saveAsName.trim() || undefined;
    projects.createProject(currentClips, videoFilenames, metadata, name);
    setSaveAsName('');
    setShowSaveInput(false);
  };

  const handleUpdateCurrent = () => {
    const currentProject = projects.getCurrentProject();
    if (currentProject) {
      projects.updateProject(currentProject.id, currentClips);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await projects.importProjects(file);
    if (result.errors.length > 0) {
      console.error('Import errors:', result.errors);
    }
    // Reset input
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  };

  const handleLoadProject = (project: Project) => {
    if (hasUnsavedChanges && currentClips.length > 0) {
      onConfirmAction({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Load this project anyway?',
        onConfirm: () => {
          projects.setCurrentProjectId(project.id);
          onLoadProject(project);
        },
      });
    } else {
      projects.setCurrentProjectId(project.id);
      onLoadProject(project);
    }
  };

  const handleDeleteProject = (id: string) => {
    const action = projects.deleteProject(id);
    if (action.title) {
      onConfirmAction(action);
    }
  };

  const currentProject = projects.getCurrentProject();
  const canSave = currentClips.length > 0;
  const canUpdate = currentProject && hasUnsavedChanges;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-in Panel (LEFT side) */}
      <div
        className={`fixed top-0 left-0 h-full w-full max-w-md bg-zinc-900 border-r border-zinc-800 shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-4 bg-amber-500/5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400">
            <FolderOpen size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Projects</h3>
            {projects.projects.length > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-medium rounded">
                {projects.projects.length}
              </span>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => projects.exportAllProjects()}
              disabled={projects.projects.length === 0}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export all projects"
            >
              <Download size={16} />
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
              title="Import projects"
            >
              <Upload size={16} />
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-65px)] overflow-y-auto">
          {/* Current Session Section */}
          {currentClips.length > 0 && (
            <div className="p-4 border-b border-zinc-800 bg-zinc-800/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Current Analysis
                </span>
                {hasUnsavedChanges && (
                  <span className="flex items-center gap-1 text-amber-500 text-xs">
                    <AlertCircle size={12} />
                    Unsaved
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-zinc-500 mb-3">
                <span className="flex items-center gap-1">
                  <Film size={12} />
                  {currentClips.length} clips
                </span>
                {videoFilenames.length > 0 && (
                  <span>{videoFilenames.length} video{videoFilenames.length > 1 ? 's' : ''}</span>
                )}
              </div>

              {/* Save actions */}
              <div className="space-y-2">
                {currentProject ? (
                  <button
                    onClick={handleUpdateCurrent}
                    disabled={!canUpdate}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save size={14} />
                    Update "{currentProject.name}"
                  </button>
                ) : null}

                {showSaveInput ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={saveAsName}
                      onChange={(e) => setSaveAsName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveNew()}
                      placeholder="Project name (optional)"
                      autoFocus
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={handleSaveNew}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setShowSaveInput(false);
                        setSaveAsName('');
                      }}
                      className="px-2 py-1.5 text-zinc-400 hover:text-zinc-200 text-xs rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSaveInput(true)}
                    disabled={!canSave}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save size={14} />
                    Save as New Project
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Projects List */}
          <div className="p-4">
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
              Saved Projects
            </h4>

            {projects.projects.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                <FolderOpen size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No saved projects yet</p>
                <p className="text-xs mt-1">Analyze some videos and save them here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.projects.map((project) => (
                  <div key={project.id} className="group">
                    <ProjectListItem
                      project={project}
                      isActive={project.id === projects.currentProjectId}
                      onLoad={() => handleLoadProject(project)}
                      onDelete={() => handleDeleteProject(project.id)}
                      onExport={() => projects.exportProject(project.id)}
                      onRename={(name) => projects.renameProject(project.id, name)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Auto-Backup Section */}
          <div className="p-4 border-t border-zinc-800">
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
              Auto-Backup
            </h4>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <HardDrive size={14} className="text-zinc-500" />
                  <span className="text-xs text-zinc-300">Auto-backup on changes</span>
                </div>
                <button
                  onClick={() => projects.setAutoBackupEnabled(!projects.autoBackupEnabled)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    projects.autoBackupEnabled ? 'bg-amber-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      projects.autoBackupEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>

              {projects.lastBackupTime && (
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <CheckCircle2 size={12} className="text-green-500" />
                  <span>Last backup: {projects.lastBackupTime}</span>
                </div>
              )}

              <button
                onClick={() => projects.triggerBackupNow()}
                disabled={projects.projects.length === 0}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={12} />
                Backup Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProjectsSidebar;
