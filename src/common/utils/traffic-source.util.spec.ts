import { platformFromSource } from './traffic-source.util';

describe('platformFromSource', () => {
  it('returns null when nothing is known, never a guessed "direct"', () => {
    expect(platformFromSource(null, null)).toBeNull();
    expect(platformFromSource(undefined, '  ')).toBeNull();
  });

  it('classifies Facebook referrers, including the link shim and mobile hosts', () => {
    expect(platformFromSource('https://l.facebook.com/l.php?u=x', null)).toBe('Facebook');
    expect(platformFromSource('http://m.facebook.com/', null)).toBe('Facebook');
    expect(platformFromSource('https://lm.facebook.com/', null)).toBe('Facebook');
    expect(platformFromSource('https://l.instagram.com/', null)).toBe('Instagram');
  });

  it('lets utm_source win over the referrer and maps known aliases', () => {
    expect(platformFromSource('https://www.google.com/', 'fb')).toBe('Facebook');
    expect(platformFromSource(null, 'my-campaign')).toBe('my-campaign');
  });

  it('reports an unknown external referrer as Other', () => {
    expect(platformFromSource('https://some-blog.example/post', null)).toBe('Other');
    expect(platformFromSource('not a url', null)).toBeNull();
  });
});
