import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchTracks } from './jamendoService';

const track = (id: string) => ({
  id, name: `Track ${id}`, artist_name: 'Artist', album_name: 'Album', duration: 120,
  audio: 'a', audiodownload: 'd', image: 'i', shareurl: 's', license_ccurl: 'l',
  musicinfo: { tags: { genres: ['electronic'] }, speed: 'high' },
});
const answer = (ids: string[]) => ({ ok: true, json: async () => ({ headers: { status: 'success', code: 0, results_count: ids.length }, results: ids.map(track) }) });

const stubFetch = (...answers: ReturnType<typeof answer>[]) => {
  const fetchMock = vi.fn();
  answers.forEach(item => fetchMock.mockResolvedValueOnce(item));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const urlOf = (fetchMock: ReturnType<typeof vi.fn>, call: number): URL => new URL(String(fetchMock.mock.calls[call][0]), 'http://localhost');

afterEach(() => vi.unstubAllGlobals());

describe('searchTracks', () => {
  it('sends the tags as an OR search, ordered by popularity', async () => {
    const fetchMock = stubFetch(answer(['1']));
    const tracks = await searchTracks('cid', { tags: ['epic', 'driving'], speed: 'high', retryDelaysMs: [0, 0] });
    const url = urlOf(fetchMock, 0);
    expect(url.searchParams.get('fuzzytags')).toBe('epic+driving');
    expect(url.searchParams.get('order')).toBe('popularity_total');
    expect(url.searchParams.has('orderby')).toBe(false);
    expect(url.searchParams.get('speed')).toBe('high');
    expect(tracks.map(item => item.id)).toEqual(['1']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries when Jamendo answers a valid search with nothing', async () => {
    const fetchMock = stubFetch(answer([]), answer([]), answer(['7', '8']));
    const tracks = await searchTracks('cid', { tags: ['epic'], speed: 'high', retryDelaysMs: [0, 0] });
    expect(tracks).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('drops the tempo filter as a last resort', async () => {
    const fetchMock = stubFetch(answer([]), answer([]), answer([]), answer(['9']));
    const tracks = await searchTracks('cid', { tags: ['calm'], speed: 'verylow', retryDelaysMs: [0, 0] });
    expect(tracks.map(item => item.id)).toEqual(['9']);
    expect(urlOf(fetchMock, 2).searchParams.get('speed')).toBe('verylow');
    expect(urlOf(fetchMock, 3).searchParams.has('speed')).toBe(false);
  });

  it('gives up with an empty list when nothing ever matches, and surfaces API errors', async () => {
    stubFetch(answer([]), answer([]), answer([]));
    expect(await searchTracks('cid', { tags: ['zzz'], retryDelaysMs: [0, 0] })).toEqual([]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ headers: { status: 'failed', code: 5, error_message: 'Invalid client id', results_count: 0 }, results: [] }) }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(searchTracks('bad', { tags: ['epic'], retryDelaysMs: [] })).rejects.toThrow('Invalid client id');
  });
});
