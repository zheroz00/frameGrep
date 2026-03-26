import React, { useState } from 'react';
import { FolderOpen, Trash2, Download, Clock, Film, Check, X, Pencil } from 'lucide-react';
import { Project } from '../../types';

interface ProjectListItemProps {
  project: Project;
  isActive: boolean;
  onLoad: () => void;
  onDelete: () => void;
  onExport: () => void;
  onRename: (name: string) => void;
}

const ProjectListItem: React.FC<ProjectListItemProps> = ({
  project,
  isActive,
  onLoad,
  onDelete,
  onExport,
  onRename,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);

  const handleSaveRename = () => {
    if (editName.trim() && editName !== project.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setEditName(project.name);
      setIsEditing(false);
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        isActive
          ? 'bg-amber-500/10 border-amber-500/50'
          : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveRename}
              autoFocus
              className="flex-1 bg-zinc-900 border border-zinc-600 rounded px-2 py-0.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleSaveRename}
              className="p-1 text-green-500 hover:bg-green-500/10 rounded"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => {
                setEditName(project.name);
                setIsEditing(false);
              }}
              className="p-1 text-zinc-400 hover:bg-zinc-700 rounded"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <FolderOpen size={14} className={isActive ? 'text-amber-400' : 'text-zinc-500'} />
            <span className="text-sm font-medium text-zinc-200 truncate">{project.name}</span>
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil size={12} />
            </button>
          </div>
        )}
        {isActive && (
          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-medium rounded shrink-0">
            ACTIVE
          </span>
        )}
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-3 text-xs text-zinc-500 mb-3">
        <span className="flex items-center gap-1">
          <Film size={12} />
          {project.clips.length} clips
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {formatDate(project.updatedAt)}
        </span>
        {project.videoFilenames.length > 1 && (
          <span>{project.videoFilenames.length} videos</span>
        )}
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-2">
        <button
          onClick={onLoad}
          className="flex-1 px-2 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium rounded transition-colors"
        >
          Load
        </button>
        <button
          onClick={onExport}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
          title="Export as JSON"
        >
          <Download size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          title="Delete project"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

export default ProjectListItem;
