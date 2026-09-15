import { describe, expect, it } from 'vitest';
import { migrateProject, relinkProjectSources } from './project';

describe('migrateProject', () => {
  it('migrates legacy clips and filename-only sources to schema version 2', () => {
    const project = migrateProject({
      id: 'p1', name: 'Legacy', createdAt: '2024-01-01', updatedAt: '2024-01-01',
      clips: [{ start_time: '00:01', end_time: '00:03', description: 'move', excitement_score: 8, sourceFile: 'a.mp4' }],
      videoFilenames: ['a.mp4'], presetId: 'cinematic', presetInstruction: 'x', provider: 'gemini',
    });

    expect(project.schemaVersion).toBe(2);
    expect(project.sources).toHaveLength(1);
    expect(project.clips[0]).toEqual(expect.objectContaining({
      sourceId: project.sources[0].id,
      startSeconds: 1,
      endSeconds: 3,
      excitementScore: 8,
    }));
  });

  it('keeps duplicate legacy filenames unresolved instead of guessing', () => {
    const project = migrateProject({
      id: 'p2', name: 'Duplicates', createdAt: '2024-01-01', updatedAt: '2024-01-01', clips: [],
      videoFilenames: ['same.mp4', 'same.mp4'], presetId: 'x', presetInstruction: 'x', provider: 'gemini',
    });
    const files = [
      new File(['one'], 'same.mp4', { lastModified: 1 }),
      new File(['two'], 'same.mp4', { lastModified: 2 }),
    ];
    const result = relinkProjectSources(project.sources, files);
    expect(result.matches.size).toBe(0);
    expect(result.ambiguousSourceIds).toHaveLength(2);
  });
});
