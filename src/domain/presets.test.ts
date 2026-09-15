import { describe, expect, it } from 'vitest';
import type { PromptPreset } from '../types';
import { applyPresetState, createPresetBackup, parsePresetBackup } from './presets';

const defaults: PromptPreset[] = [
  { id: 'builtin', name: 'Built in', instruction: 'factory', maxDuration: 6, isDefault: true, category: 'fpv' },
];

describe('preset persistence', () => {
  it('applies built-in overrides and preserves custom presets', () => {
    const state = {
      schemaVersion: 2 as const,
      overrides: { builtin: { instruction: 'edited', maxDuration: 9 } },
      customPresets: [{ id: 'custom', name: 'Custom', instruction: 'mine', maxDuration: 3, category: 'custom' as const }],
    };
    expect(applyPresetState(defaults, state)).toEqual([
      expect.objectContaining({ id: 'builtin', instruction: 'edited', maxDuration: 9, isDefault: true }),
      expect.objectContaining({ id: 'custom', instruction: 'mine' }),
    ]);
  });

  it('round-trips built-in overrides and custom presets through a v2 backup', () => {
    const edited = [{ ...defaults[0], instruction: 'edited' }, { id: 'custom', name: 'Custom', instruction: 'mine', maxDuration: 4, category: 'custom' as const }];
    const backup = createPresetBackup(defaults, edited);
    expect(parsePresetBackup(backup)).toEqual(backup);
  });

  it('reset removes overrides and custom presets', () => {
    expect(applyPresetState(defaults, { schemaVersion: 2, overrides: {}, customPresets: [] })).toEqual(defaults);
  });
});
