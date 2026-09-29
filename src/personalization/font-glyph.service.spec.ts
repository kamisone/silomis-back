import { FontGlyphService } from './font-glyph.service';

/**
 * These run against the real files in assets/fonts, because the question they
 * answer is about those files: can this TTF draw this alphabet unaided? A
 * stubbed font would only test the stub.
 */
describe('FontGlyphService.canLayOut', () => {
  const svc = new FontGlyphService();
  const face = () => {
    const f = svc.font('block-classic', 400) ?? svc.font('serif-classic', 400);
    if (!f) throw new Error('No font files in assets/fonts — run `node scripts/fetch-fonts.mjs`.');
    return f;
  };

  it.each([['plain Latin', 'Leo'], ['digits', 'No 7'], ['the allowed punctuation', "Tom & Amy's - B."]])(
    'lays out %s itself',
    (_what, text) => {
      expect(svc.canLayOut(face(), text)).toBe(true);
    },
  );

  it.each([
    ['Arabic', 'محمد'],
    ['Arabic with harakat', 'مُحَمَّد'],
    ['Chinese', '張偉'],
    ['Hebrew', 'שלום'],
    ['Devanagari', 'नमस्ते'],
  ])('hands %s to the renderer rather than drawing boxes', (_what, text) => {
    expect(svc.canLayOut(face(), text)).toBe(false);
  });

  it('hands over a Latin letter the file happens not to have', () => {
    // Every face here is Latin, so pick something outside its coverage but
    // inside the scripts we would otherwise lay out ourselves.
    const f = face();
    const missing = [...'ẛǮ🅐'].find((ch) => f.charToGlyphIndex(ch) === 0);
    if (!missing) return; // an unusually complete face; nothing to assert
    expect(svc.canLayOut(f, `Leo ${missing}`)).toBe(false);
  });
});
