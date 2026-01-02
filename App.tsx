
import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Zap, Video, Terminal, AlertTriangle, PlayCircle, Loader2, 
  Download, CloudUpload, Cpu, FileCode, Monitor, Settings2, 
  Save, Trash2, RefreshCw, Sparkles, Wand2, HardDrive, FolderOpen, 
  CheckCircle2, FileUp, FileDown, XCircle, AlertCircle, Clock
} from 'lucide-react';
import { uploadVideo, analyzeVideo, optimizeSystemInstruction, UploadPhase } from './services/geminiService';
import VideoPlayer from './components/VideoPlayer';
import ClipCard from './components/ClipCard';
import { AppStatus, ClipSegment, VideoFile, PromptPreset } from './types';
import { generateEDL, generateFFmpegScript, exportPresetsToJSON } from './utils/exportUtils';

// Safe localStorage write that handles quota errors
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

const DEFAULT_PRESETS: PromptPreset[] = [
  {
    id: 'cinematic',
    name: 'Cinematic Supercut',
    isDefault: true,
    maxDuration: 15,
    instruction: `Role: Expert FPV Cinematographer specializing in flow and artistic drone footage.

Objective: Extract the most visually stunning, smooth sequences that showcase continuous motion and artistic flying.

What to look for:
- FLOW LINES: Extended sequences where the drone maintains smooth, unbroken motion through the environment. Look for S-curves, banking turns, and fluid transitions between obstacles.
- PROXIMITY FLYING: Moments where the drone glides close to surfaces (walls, trees, water, ground) with controlled, steady movement. The closer and smoother, the better.
- POWER LOOPS & ORBITS: Large, sweeping vertical loops or orbital paths around objects. These should feel expansive and graceful.
- DIVE & RECOVERY: Controlled dives from height followed by smooth pullouts, especially over scenic terrain or towards interesting subjects.
- SCENERY REVEALS: Moments where the drone movement reveals a beautiful landscape, structure, or vista.
- CONNECTED MANEUVERS: When multiple moves flow together (e.g., proximity pass → power loop → dive), treat as ONE continuous clip.

Visual cues to prioritize:
- Stable horizon or intentional smooth rolls
- Consistent speed without stuttering
- Clean lines through architecture or nature
- Moments of "weightlessness" or floating sensation

Scoring (1-10):
- 9-10: Perfect flow, jaw-dropping visuals, seamless multi-move sequences
- 7-8: Great cinematics with minor imperfections
- 5-6: Good moments but some instability or abrupt transitions
- 1-4: Average flying, choppy, or uninteresting scenery

Ignore: Jittery/shaky footage, crashes, prop wash oscillation, technical troubleshooting, ground footage, calibration sequences.`
  },
  {
    id: 'social-shorts',
    name: 'Shorts / Algorithm Ready',
    isDefault: true,
    maxDuration: 8,
    instruction: `Role: Social media content curator for viral FPV clips.

Objective: Find high-energy, attention-grabbing moments that would perform well on TikTok, Instagram Reels, or YouTube Shorts.

What makes a clip "algorithm ready":
- INSTANT IMPACT: The clip should hook viewers in the first second. Look for sudden speed bursts, unexpected gaps, or dramatic angle changes.
- GAP HITS: Drone threading through tight openings (windows, doorways, branches, structures). Smaller gaps = higher score.
- SPEED RUNS: Sections of maximum velocity, especially through complex environments.
- SURPRISE ELEMENTS: Unexpected obstacles appearing and being narrowly avoided, sudden reveals, or creative angles.
- ACROBATIC MOVES: Quick flips, rolls, or spins that are visually dynamic but controlled.
- REACTION-WORTHY: Would someone watching say "whoa" or "no way"?

Audio cues (if available):
- Motor pitch changes indicating throttle spikes
- Wind noise increases during speed runs
- Impact sounds (for close calls)

Scoring (1-10):
- 9-10: Viral potential - makes you want to rewatch immediately
- 7-8: Strong hook, shareable content
- 5-6: Decent action but needs more punch
- 1-4: Too slow, too long, or visually unclear

Keep clips punchy but complete. Include the full moment from setup through the action - don't cut mid-maneuver.

Ignore: Slow cruising, repetitive patterns, distant shots, shaky footage.`
  },
  {
    id: 'technical',
    name: 'Gap & Technical',
    isDefault: true,
    maxDuration: 10,
    instruction: `Role: Technical FPV analyst specializing in precision flying and complex maneuvers.

Objective: Identify moments of exceptional pilot skill - tight gaps, complex combos, and precision control.

Technical elements to extract:
- MICRO GAPS: Drone passing through extremely tight openings where margins are measured in inches. Windows, fence gaps, tree branches, structural gaps.
- SPLIT-S & MATTY FLIPS: Inverted diving maneuvers that require precise throttle and stick control.
- PROXIMITY THREADING: Flying between multiple obstacles in quick succession (e.g., between tree trunks, through scaffolding).
- INVERTED FLYING: Sustained inverted flight or inverted proximity passes.
- JUICY MOVES: Combination maneuvers like gap → flip → gap or dive → powerloop → proximity pass.
- RECOVERY SAVES: Moments where the pilot recovers from near-disaster with skilled stick input.
- YAWED ENTRIES: Flying through gaps while yawing, making the entry angle more challenging.

Precision indicators:
- Consistent stick movements (smooth throttle, no over-correction)
- Centered gap entries (not scraping edges)
- Quick but controlled direction changes
- Smooth rotation rates on flips/rolls

Scoring (1-10):
- 9-10: Competition-level precision, multi-element combos executed flawlessly
- 7-8: Impressive technical skill with minor hesitation
- 5-6: Solid gaps/tricks but room for improvement
- 1-4: Basic flying or imprecise execution

Look for SEQUENCES where technical moves chain together. A gap into a powerloop is more valuable than isolated moves.

Ignore: Basic cruising, wide-open flying, crashes (unless it's an impressive save).`
  },
  {
    id: 'crash',
    name: 'Crash & Fail Reel',
    isDefault: true,
    maxDuration: 6,
    instruction: `Role: FPV fail compilation curator.

Objective: Find every crash, collision, close-call, and spectacular failure for a blooper reel.

What to extract:
- FULL CRASHES: Direct impacts with objects, ground, water, or structures. Include the approach and the moment of impact.
- CLOSE CALLS: Near-misses where disaster was barely avoided. The "almost crashed" moments.
- LOSS OF CONTROL: Tumbling, spinning out, failsafes, or loss of video signal moments.
- PROP STRIKES: Clipping objects that cause wobble or loss of control.
- WATER LANDINGS: Intentional or unintentional water contact.
- STUCK DRONES: Getting caught in trees, nets, or structures.
- PILOT ERROR: Mistimed tricks, botched gaps, or overconfident maneuvers gone wrong.

Scoring (1-10 based on entertainment value):
- 9-10: Spectacular crash, funny outcome, or dramatic near-miss
- 7-8: Solid fail with good comedic timing
- 5-6: Minor crash or less dramatic close call
- 1-4: Barely noticeable issues

Important: Include the LEAD-UP to the crash. Start 1-2 seconds before the mistake happens so viewers can anticipate the fail.

Visual/Audio cues:
- Sudden camera shake or tumbling
- Screen going dark or to static
- Motor sounds cutting out or changing pitch dramatically
- Rapid uncontrolled rotation

Include: Hard landings, failed recovery attempts, pilot overconfidence moments.
Ignore: Intentional landings, normal flight, minor vibration.`
  }
];

const parseTime = (timeStr: string): number => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':').map(Number);
  // Check for NaN values
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
};

const isValidClip = (clip: ClipSegment): boolean => {
  const start = parseTime(clip.start_time);
  const end = parseTime(clip.end_time);
  return end > start && start >= 0;
};

export default function App() {
  const [apiKey, setApiKey] = useState<string>('');
  const [videoFile, setVideoFile] = useState<VideoFile | null>(null);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [clips, setClips] = useState<ClipSegment[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Progress tracking
  const [uploadPhase, setUploadPhase] = useState<UploadPhase | 'analyzing'>('uploading');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [processingProgress, setProcessingProgress] = useState({ attempt: 0, maxAttempts: 150 });
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Prompt Lab State
  const [isPromptLabOpen, setIsPromptLabOpen] = useState(false);
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState('cinematic');
  const [currentInstruction, setCurrentInstruction] = useState('');
  const [currentMaxDuration, setCurrentMaxDuration] = useState(6);
  const [newPresetName, setNewPresetName] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Custom Modal State for Sandbox environments
  const [confirmAction, setConfirmAction] = useState<{ 
    isOpen: boolean; 
    title: string; 
    message: string; 
    onConfirm: () => void; 
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Persistence: Disk Sync State
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const [currentStart, setCurrentStart] = useState<number | undefined>(undefined);
  const [currentEnd, setCurrentEnd] = useState<number | undefined>(undefined);
  const [activeClipIndex, setActiveClipIndex] = useState<number | null>(null);

  // Load Presets
  useEffect(() => {
    const saved = localStorage.getItem('fpv_presets');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const customOnly = parsed.filter((p: PromptPreset) => !p.isDefault);
        setPresets([...DEFAULT_PRESETS, ...customOnly]);
      } catch (e) {
        setPresets(DEFAULT_PRESETS);
      }
    } else {
      setPresets(DEFAULT_PRESETS);
      safeLocalStorageSet('fpv_presets', JSON.stringify(DEFAULT_PRESETS));
    }

    if (process.env.API_KEY) {
      setApiKey(process.env.API_KEY);
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

  // Disk Persistence Logic
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

  // Check if File System Access API is supported (Chrome/Edge only)
  const supportsFileSystemAccess = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const connectToLocalFolder = async () => {
    if (!supportsFileSystemAccess) return;
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);
      for (const p of presets) {
        await syncToDisk(p);
      }
    } catch (err) {
      console.error("Folder selection cancelled or failed", err);
    }
  };

  const optimizePrompt = async () => {
    if (!apiKey || !currentInstruction) return;
    setIsOptimizing(true);
    try {
      const optimized = await optimizeSystemInstruction(apiKey, currentInstruction);
      // Save to preset (persists to localStorage)
      updateCurrentPresetInstruction(optimized);
    } catch (err) {
      console.error(err);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Cleanup previous blob URL to prevent memory leak
      if (videoFile?.url) {
        URL.revokeObjectURL(videoFile.url);
      }
      const url = URL.createObjectURL(file);
      setVideoFile({ file, url });
      setStatus(AppStatus.IDLE);
      setClips([]);
      setError(null);
    }
  };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (videoFile?.url) {
        URL.revokeObjectURL(videoFile.url);
      }
    };
  }, [videoFile?.url]);

  const handleImportPresets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as PromptPreset[];
        const customOnly = imported.filter(p => !p.isDefault);
        const merged = [...presets, ...customOnly];
        const unique = merged.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        setPresets(unique);
        safeLocalStorageSet('fpv_presets', JSON.stringify(unique));
      } catch (err) {
        setError("Invalid preset file format.");
      }
    };
    reader.readAsText(file);
  };

  const runAnalysis = async () => {
    if (!videoFile || !apiKey) {
      setError("Please provide both an API Key and a Video File.");
      return;
    }
    setStatus(AppStatus.UPLOADING);
    setError(null);
    setElapsedTime(0);
    setUploadPhase('uploading');
    setProcessingProgress({ attempt: 0, maxAttempts: 150 });

    // Start elapsed time timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    // Inject strict temporal constraints into whatever instruction is current
    const minDuration = Math.max(3, Math.floor(currentMaxDuration / 2));
    const temporalConstraint = `\n\nCRITICAL CLIP DURATION RULES:
1. TARGET DURATION: Aim for ${minDuration}-${currentMaxDuration} seconds per clip. Shorter clips lose context.
2. COMPLETE MANEUVERS: Each clip MUST capture the FULL maneuver from setup to completion. Include the approach, the trick, AND the exit.
3. CONNECTED MOVES: If maneuvers flow together (e.g., proximity pass into a power loop, or dive into a roll), capture them as ONE clip, not separate clips.
4. NEVER cut a clip mid-maneuver. Wait for the drone to stabilize or transition before ending.
5. When in doubt, make the clip LONGER to preserve context, up to ${currentMaxDuration} seconds.`;

    const finalInstruction = currentInstruction + temporalConstraint;

    try {
      const fileUri = await uploadVideo(apiKey, videoFile.file, (phase, detail) => {
        setUploadPhase(phase);
        if (detail?.attempt !== undefined) {
          setProcessingProgress({ attempt: detail.attempt, maxAttempts: detail.maxAttempts || 150 });
        }
      });
      setStatus(AppStatus.ANALYZING);
      setUploadPhase('analyzing');
      const result = await analyzeVideo(apiKey, fileUri, videoFile.file.type, finalInstruction);
      // Filter out invalid clips (bad timestamps or end <= start)
      const validClips = result.filter(isValidClip);
      if (validClips.length < result.length) {
        console.warn(`Filtered ${result.length - validClips.length} invalid clips`);
      }
      setClips(validClips);
      setStatus(AppStatus.COMPLETE);
    } catch (e: any) {
      setError(e.message);
      setStatus(AppStatus.ERROR);
    } finally {
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handlePlayClip = (startStr: string, endStr: string, index: number) => {
    setCurrentStart(parseTime(startStr));
    setCurrentEnd(parseTime(endStr));
    setActiveClipIndex(index);
  };

  const savePreset = async () => {
    if (!newPresetName) return;
    const newPreset: PromptPreset = {
      id: Date.now().toString(),
      name: newPresetName,
      instruction: currentInstruction,
      maxDuration: currentMaxDuration,
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    setActivePresetId(newPreset.id);
    safeLocalStorageSet('fpv_presets', JSON.stringify(updated));
    setNewPresetName('');
    if (directoryHandle) await syncToDisk(newPreset);
  };

  const updateCurrentPresetDuration = (val: number) => {
    setCurrentMaxDuration(val);
    const updated = presets.map(p => p.id === activePresetId ? { ...p, maxDuration: val } : p);
    setPresets(updated);
    safeLocalStorageSet('fpv_presets', JSON.stringify(updated));
  };

  const updateCurrentPresetInstruction = (instruction: string) => {
    setCurrentInstruction(instruction);
    const updated = presets.map(p => p.id === activePresetId ? { ...p, instruction } : p);
    setPresets(updated);
    safeLocalStorageSet('fpv_presets', JSON.stringify(updated));
  };

  const deletePreset = (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (preset?.isDefault) return;
    
    setConfirmAction({
      isOpen: true,
      title: 'Delete Preset',
      message: `Are you sure you want to delete "${preset?.name}"?`,
      onConfirm: () => {
        const updated = presets.filter(p => p.id !== id);
        setPresets(updated);
        if (activePresetId === id) setActivePresetId('cinematic');
        safeLocalStorageSet('fpv_presets', JSON.stringify(updated));
        setConfirmAction(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const resetToDefaults = () => {
    setConfirmAction({
      isOpen: true,
      title: 'Reset Defaults',
      message: 'Restore all factory presets and remove custom prompts?',
      onConfirm: () => {
        setPresets(DEFAULT_PRESETS);
        setActivePresetId('cinematic');
        safeLocalStorageSet('fpv_presets', JSON.stringify(DEFAULT_PRESETS));
        setConfirmAction(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isBusy = status === AppStatus.UPLOADING || status === AppStatus.PROCESSING || status === AppStatus.ANALYZING;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans selection:bg-amber-500/30">
      {/* Custom Confirmation Modal */}
      {confirmAction.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-500 mb-4">
              <AlertCircle size={24} />
              <h3 className="text-lg font-bold text-white">{confirmAction.title}</h3>
            </div>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmAction(prev => ({ ...prev, isOpen: false }))} className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-white transition-colors">Cancel</button>
              <button onClick={confirmAction.onConfirm} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-red-900/20 transition-all">Confirm</button>
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              <Zap className="text-zinc-900" size={20} fill="currentColor" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">FPV<span className="text-zinc-500 font-light">.AI</span> Editor</h1>
          </div>
          <div className="flex items-center gap-4">
            {!process.env.API_KEY && (
               <input type="password" placeholder="Gemini API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-amber-500 w-48 transition-colors" />
            )}
            <button onClick={() => setIsPromptLabOpen(!isPromptLabOpen)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isPromptLabOpen ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'}`}>
              <Wand2 size={16} /> Prompt Lab
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Prompt Lab Panel */}
            {isPromptLabOpen && (
              <div className="bg-zinc-900 border border-amber-500/30 rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-top-4 duration-300">
                <div className="p-4 bg-amber-500/5 border-b border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-500">
                    <Sparkles size={18} />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Prompt Lab</h3>
                  </div>
                  <div className="flex gap-4 items-center">
                    <button onClick={() => exportPresetsToJSON(presets)} className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1.5 text-xs"><FileDown size={14} /> Export</button>
                    <button onClick={() => importInputRef.current?.click()} className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1.5 text-xs"><FileUp size={14} /> Import</button>
                    <input type="file" ref={importInputRef} onChange={handleImportPresets} accept=".json" className="hidden" />
                    {supportsFileSystemAccess && (
                      <>
                        <div className="w-px h-4 bg-zinc-800" />
                        <button onClick={connectToLocalFolder} className={`flex items-center gap-2 text-xs font-medium transition-colors ${directoryHandle ? 'text-green-500' : 'text-zinc-500 hover:text-white'}`}>{directoryHandle ? <CheckCircle2 size={14} /> : <HardDrive size={14} />} {directoryHandle ? 'Linked' : 'Link Disk'}</button>
                      </>
                    )}
                    <button onClick={resetToDefaults} className="p-1.5 text-zinc-500 hover:text-white transition-colors"><RefreshCw size={14} /></button>
                  </div>
                </div>
                
                <div className="p-6 space-y-6">
                  {/* Preset Selector */}
                  <div className="flex flex-wrap gap-2">
                    {presets.map(p => (
                      <div key={p.id} className="relative group/tag">
                        <button onClick={() => setActivePresetId(p.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-2 ${activePresetId === p.id ? 'bg-amber-500 border-amber-500 text-zinc-950' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}>{p.name}</button>
                        {!p.isDefault && (
                          <button onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }} className="absolute -top-1 -right-1 bg-zinc-800 text-zinc-400 hover:text-red-500 rounded-full p-0.5 opacity-0 group-hover/tag:opacity-100 transition-opacity border border-zinc-700"><XCircle size={12} /></button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Temporal Settings */}
                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-zinc-500">
                      <div className="flex items-center gap-2"><Clock size={14} /> Temporal Constraints</div>
                      <span className="text-amber-500">{currentMaxDuration}s max duration</span>
                    </div>
                    <input 
                      type="range" 
                      min="3" 
                      max="20" 
                      step="1" 
                      value={currentMaxDuration}
                      onChange={(e) => updateCurrentPresetDuration(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <p className="text-[10px] text-zinc-600 italic">Overrides instruction text to ensure highlights capture the full maneuver up to {currentMaxDuration} seconds.</p>
                  </div>

                  {/* Instruction Area */}
                  <div className="relative group/text">
                    <textarea value={currentInstruction} onChange={(e) => updateCurrentPresetInstruction(e.target.value)} className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs font-mono text-zinc-300 focus:outline-none focus:border-amber-500/50 resize-none transition-all" placeholder="Enter system instruction for Gemini..." />
                    <div className="absolute top-2 right-2 flex gap-2">
                      <button onClick={optimizePrompt} disabled={isOptimizing || !apiKey} className="bg-zinc-900 border border-zinc-700 hover:border-amber-500 p-2 rounded-md text-amber-500 transition-all flex items-center gap-2 disabled:opacity-50">
                        {isOptimizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        <span className="text-[10px] font-bold uppercase tracking-tight">AI Polish</span>
                      </button>
                    </div>
                  </div>

                  {/* Save Logic */}
                  <div className="flex items-center gap-2">
                    <input type="text" placeholder="Save as new preset..." value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500/50" />
                    <button onClick={savePreset} disabled={!newPresetName} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"><Save size={14} /> Create Preset</button>
                  </div>
                </div>
              </div>
            )}

            <div className="relative group">
              {videoFile ? (
                <VideoPlayer src={videoFile.url} startTime={currentStart} endTime={currentEnd} autoPlay={true} />
              ) : (
                <div className="w-full aspect-video bg-zinc-900/50 border border-dashed border-zinc-800 rounded-xl flex flex-col items-center justify-center gap-4 text-zinc-600 group-hover:border-zinc-700 transition-colors">
                  <Video size={48} className="opacity-50" />
                  <p className="text-sm font-medium">Drop 4K Footage Here</p>
                </div>
              )}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg">
              <div className="flex items-center gap-4">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-3 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors">
                    <Upload size={18} className="text-zinc-400" />
                    <span className="text-sm font-medium truncate">{videoFile ? videoFile.file.name : "Select Footage"}</span>
                  </div>
                  <input type="file" className="hidden" accept="video/*" onChange={handleFileUpload} />
                </label>
                <button
                  onClick={runAnalysis}
                  disabled={!videoFile || isBusy}
                  className={`px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-all min-w-[140px] justify-center ${
                    isBusy
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/20 border border-amber-500/30'
                      : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-lg shadow-amber-500/10'
                  }`}
                >
                  {isBusy ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} fill="currentColor" />}
                  {isBusy ? "Processing" : "Analyze"}
                </button>
              </div>
              {isBusy && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-3 text-sm font-medium ${
                      uploadPhase === 'uploading' ? 'text-cyan-400' :
                      uploadPhase === 'processing' ? 'text-amber-400' :
                      'text-purple-400'
                    }`}>
                      {uploadPhase === 'uploading' && <CloudUpload size={16} className="animate-bounce" />}
                      {uploadPhase === 'processing' && <Cpu size={16} className="animate-pulse" />}
                      {uploadPhase === 'analyzing' && <Sparkles size={16} className="animate-pulse" />}
                      <span>
                        {uploadPhase === 'uploading' && "Uploading to Gemini..."}
                        {uploadPhase === 'processing' && `Processing on Gemini (${processingProgress.attempt}/${processingProgress.maxAttempts})...`}
                        {uploadPhase === 'analyzing' && "AI analyzing footage..."}
                      </span>
                    </div>
                    <span className="text-amber-500 font-mono font-bold tabular-nums text-sm">
                      {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}
                    </span>
                  </div>
                  {uploadPhase === 'processing' && (
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                        style={{ width: `${Math.min((processingProgress.attempt / processingProgress.maxAttempts) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
              {error && <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-3 text-red-400 text-sm"><AlertTriangle size={16} />{error}</div>}
            </div>

            {clips.length > 0 && videoFile && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Export Supercut</h3>
                  <div className="flex gap-2">
                    <button onClick={() => downloadFile(generateEDL(videoFile.file.name, clips), 'FPV_Supercut.edl')} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded flex items-center gap-2 transition-colors"><Monitor size={12} /> Resolve / Premiere (.edl)</button>
                    <button onClick={() => downloadFile(generateFFmpegScript(videoFile.file.name, clips, 'unix'), 'stitch.sh')} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded flex items-center gap-2 transition-colors"><FileCode size={12} /> FFmpeg (.sh)</button>
                  </div>
                </div>
                <div className="p-4 bg-black/50">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3 font-mono">
                    <Terminal size={14} /> Local Concatenation CLI
                  </div>
                  <pre className="text-[10px] font-mono text-zinc-400 overflow-x-auto whitespace-pre p-3 bg-black rounded border border-zinc-800 scrollbar-thin">
                    {generateFFmpegScript(videoFile.file.name, clips, 'unix').split('\n').filter(l => l.includes('ffmpeg')).join('\n')}
                  </pre>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 flex flex-col h-[calc(100vh-8rem)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PlayCircle className="text-amber-500" size={20} />
                <h2 className="text-lg font-bold text-white">Analyzed Clips</h2>
              </div>
              {clips.length > 0 && <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-500 rounded">{clips.length} HIGHLIGHTS FOUND</span>}
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 pb-8 scrollbar-thin">
              {clips.length === 0 && !isBusy ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl p-8 bg-zinc-900/20">
                  <Zap className="opacity-10 mb-4" size={48} />
                  <p className="text-center text-sm opacity-50">Upload footage to begin highlight extraction.</p>
                </div>
              ) : (
                clips.map((clip, idx) => (
                  <ClipCard 
                    key={idx} 
                    index={idx} 
                    clip={clip} 
                    filename={videoFile?.file.name || 'video.mp4'}
                    onPlay={() => handlePlayClip(clip.start_time, clip.end_time, idx)}
                    isActive={activeClipIndex === idx}
                  />
                ))
              )}
              {isBusy && <div className="space-y-3 animate-pulse">{[1,2,3,4,5].map(i => <div key={i} className="h-32 bg-zinc-900/50 rounded-xl border border-zinc-800" />)}</div>}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
