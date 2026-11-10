import { describe, expect, it } from 'vitest';
import { rememberFolder } from './recentFolders';

describe('rememberFolder', () => {
  it('moves a used folder to the front without duplicating it', () => {
    expect(rememberFolder(['/a', '/b', '/c'], ' /b ')).toEqual(['/b', '/a', '/c']);
  });

  it('caps the list and ignores blank input', () => {
    expect(rememberFolder(['/a', '/b'], '/c', 2)).toEqual(['/c', '/a']);
    expect(rememberFolder(['/a'], '   ')).toEqual(['/a']);
  });
});
