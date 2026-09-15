import { describe, expect, it } from 'vitest';
import { UNKNOWN_SOURCE_FILENAME, migrateProject, migrateProjectDetailed, needsProjectMigration, relinkProjectSources } from './project';

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

describe('migrateProjectDetailed', () => {
  const base = { id: 'p3', name: 'Lossless', createdAt: '2024-01-01', updatedAt: '2024-01-01', presetId: 'x', presetInstruction: 'x', provider: 'gemini' };
  const clip = (overrides: Record<string, unknown>) => ({ start_time: '00:01', end_time: '00:03', description: 'move', excitement_score: 7, ...overrides });

  it('keeps a clip whose source file is unknown by synthesizing a relinkable legacy source', () => {
    const { project, rejections } = migrateProjectDetailed({ ...base, clips: [clip({ sourceFile: 'missing.mp4' })], videoFilenames: ['a.mp4'] });
    expect(rejections).toHaveLength(0);
    expect(project.clips).toHaveLength(1);
    const source = project.sources.find(item => item.id === project.clips[0].sourceId);
    expect(source).toMatchObject({ filename: 'missing.mp4', legacy: true });
    expect(new Set(project.sources.map(item => item.id)).size).toBe(project.sources.length);
  });

  it('keeps clips when the project has no sources at all', () => {
    const { project, rejections } = migrateProjectDetailed({ ...base, clips: [clip({})], videoFilenames: [] });
    expect(rejections).toHaveLength(0);
    expect(project.clips).toHaveLength(1);
    expect(project.sources[0]).toMatchObject({ filename: UNKNOWN_SOURCE_FILENAME, legacy: true });
  });

  it('reports clips it cannot normalize instead of dropping them silently', () => {
    const { project, rejections } = migrateProjectDetailed({
      ...base,
      clips: [clip({ start_time: 'nope', sourceFile: 'a.mp4' }), 'garbage', clip({ sourceFile: 'a.mp4' })],
      videoFilenames: ['a.mp4'],
    });
    expect(project.clips).toHaveLength(1);
    expect(rejections.map(item => item.index)).toEqual([0, 1]);
  });

  it('migrateProject stays a thin wrapper over the detailed result', () => {
    const input = { ...base, clips: [clip({ sourceFile: 'a.mp4' })], videoFilenames: ['a.mp4'] };
    expect(migrateProject(input)).toEqual(migrateProjectDetailed(input).project);
  });
});

describe('needsProjectMigration', () => {
  it('is false only for schema version 2 objects', () => {
    expect(needsProjectMigration({ schemaVersion: 2 })).toBe(false);
    expect(needsProjectMigration({ schemaVersion: 1 })).toBe(true);
    expect(needsProjectMigration({ videoFilenames: ['a.mp4'] })).toBe(true);
    expect(needsProjectMigration(null)).toBe(true);
  });
});
