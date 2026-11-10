import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESETS } from './defaultPresets';
import { SHOP_PRESETS } from './shopPresets';

describe('DEFAULT_PRESETS', () => {
  it('has unique ids, so overrides and backups map to exactly one preset', () => {
    const ids = DEFAULT_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every built-in a category, instruction and positive max duration', () => {
    for (const preset of DEFAULT_PRESETS) {
      expect(preset.isDefault, preset.id).toBe(true);
      expect(preset.category, preset.id).toMatch(/^(fpv|shop|generic)$/);
      expect(preset.instruction.trim().length, preset.id).toBeGreaterThan(0);
      expect(preset.maxDuration, preset.id).toBeGreaterThan(0);
    }
  });

  it('includes every shop preset under the shop category', () => {
    expect(SHOP_PRESETS.length).toBeGreaterThan(0);
    for (const preset of SHOP_PRESETS) {
      expect(DEFAULT_PRESETS).toContain(preset);
      expect(preset.category).toBe('shop');
    }
  });
});
