import type { PromptPreset } from '../types';

export interface PresetOverride {
  name?: string;
  instruction?: string;
  maxDuration?: number;
  category?: PromptPreset['category'];
}

export interface PresetStateV2 {
  schemaVersion: 2;
  overrides: Record<string, PresetOverride>;
  customPresets: PromptPreset[];
}

export const applyPresetState = (defaults: PromptPreset[], state: PresetStateV2): PromptPreset[] => [
  ...defaults.map(preset => ({ ...preset, ...(state.overrides[preset.id] ?? {}), isDefault: true })),
  ...state.customPresets.map(preset => ({ ...preset, isDefault: false, category: preset.category ?? 'custom' })),
];

export const createPresetState = (defaults: PromptPreset[], current: PromptPreset[]): PresetStateV2 => {
  const currentById = new Map(current.map(preset => [preset.id, preset]));
  const overrides: Record<string, PresetOverride> = {};
  defaults.forEach(factory => {
    const saved = currentById.get(factory.id);
    if (!saved) return;
    const override: PresetOverride = {};
    if (saved.name !== factory.name) override.name = saved.name;
    if (saved.instruction !== factory.instruction) override.instruction = saved.instruction;
    if (saved.maxDuration !== factory.maxDuration) override.maxDuration = saved.maxDuration;
    if (saved.category !== factory.category) override.category = saved.category;
    if (Object.keys(override).length) overrides[factory.id] = override;
  });
  const defaultIds = new Set(defaults.map(preset => preset.id));
  return { schemaVersion: 2, overrides, customPresets: current.filter(preset => !defaultIds.has(preset.id)).map(preset => ({ ...preset, isDefault: false })) };
};

export const createPresetBackup = createPresetState;

export const parsePresetBackup = (value: unknown, defaults: PromptPreset[] = []): PresetStateV2 => {
  if (Array.isArray(value)) {
    value.forEach((preset, index) => {
      const candidate = preset as Partial<PromptPreset> | null;
      if (!candidate || typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.instruction !== 'string' || !Number.isFinite(candidate.maxDuration) || Number(candidate.maxDuration) <= 0) {
        throw new Error(`Invalid preset at index ${index}`);
      }
    });
    return createPresetState(defaults, value as PromptPreset[]);
  }
  if (!value || typeof value !== 'object') throw new Error('Preset backup must be an object or array');
  const candidate = value as Partial<PresetStateV2>;
  if (candidate.schemaVersion !== 2 || !candidate.overrides || !Array.isArray(candidate.customPresets)) {
    throw new Error('Unsupported preset backup schema');
  }
  if (typeof candidate.overrides !== 'object' || Array.isArray(candidate.overrides)) throw new Error('Preset overrides must be an object');
  const overrides: Record<string, PresetOverride> = {};
  for (const [id, unknownOverride] of Object.entries(candidate.overrides)) {
    if (!unknownOverride || typeof unknownOverride !== 'object' || Array.isArray(unknownOverride)) throw new Error(`Invalid override for ${id}`);
    const override = unknownOverride as PresetOverride;
    if (override.instruction !== undefined && typeof override.instruction !== 'string') throw new Error(`Invalid instruction override for ${id}`);
    if (override.maxDuration !== undefined && (!Number.isFinite(override.maxDuration) || override.maxDuration <= 0)) throw new Error(`Invalid duration override for ${id}`);
    overrides[id] = { ...override };
  }
  const customPresets = candidate.customPresets.map((preset, index) => {
    if (!preset || typeof preset.id !== 'string' || typeof preset.name !== 'string' || typeof preset.instruction !== 'string' || !Number.isFinite(preset.maxDuration) || preset.maxDuration <= 0) {
      throw new Error(`Invalid custom preset at index ${index}`);
    }
    return { ...preset, isDefault: false };
  });
  return { schemaVersion: 2, overrides, customPresets };
};
