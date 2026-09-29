import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as opentype from 'opentype.js';

/**
 * Lettering as glyph outlines, from the same font files the editor loads.
 *
 * A `<text>` element in an SVG is drawn with whatever face the renderer can
 * find, and the server has none of the editor's — so the basket picture, the
 * mockup and the production sheet all came out in a stand-in face, and
 * `textLength` (which the editor uses to force every line to its measured
 * width) is ignored by the renderer altogether. Outlines have neither
 * problem: the path is the face, and a path can be scaled to any width.
 *
 * Fonts live in assets/fonts (see scripts/fetch-fonts.mjs), one TTF per
 * weight the family has; a face with no file keeps the old `<text>` path.
 */
@Injectable()
export class FontGlyphService {
  private readonly logger = new Logger(FontGlyphService.name);
  private readonly dir = [path.resolve(__dirname, '../../assets/fonts'), path.resolve(__dirname, '../../../assets/fonts'), path.resolve(process.cwd(), 'assets/fonts')].find((d) => existsSync(path.join(d, 'manifest.json')));
  private readonly manifest: Record<string, Record<string, string>> = this.dir ? (JSON.parse(readFileSync(path.join(this.dir, 'manifest.json'), 'utf8')) as Record<string, Record<string, string>>) : {};
  private readonly cache = new Map<string, opentype.Font | null>();

  constructor() {
    if (!this.dir) this.logger.warn('No embroidery font files found (assets/fonts) — lettering will be drawn with the renderer’s fallback face. Run `node scripts/fetch-fonts.mjs`.');
  }

  /** The face's file nearest the weight asked for, or null when the face has none. */
  font(fontKey: string, weight: number): opentype.Font | null {
    const files = this.manifest[fontKey];
    if (!files || !this.dir) return null;
    const weights = Object.keys(files).map(Number);
    const nearest = weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), weights[0]);
    const file = files[String(nearest)];
    const id = `${fontKey}:${nearest}`;
    if (!this.cache.has(id)) {
      try {
        const buf = readFileSync(path.join(this.dir, file));
        this.cache.set(id, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
      } catch (err) {
        this.logger.warn(`Font ${file} could not be read: ${(err as Error).message}`);
        this.cache.set(id, null);
      }
    }
    return this.cache.get(id) ?? null;
  }

  /**
   * Whether this face's file can lay out this text on its own.
   *
   * Two questions, and a "no" to either sends the sheet to live `<text>`, where
   * whatever opens it does the work properly:
   *
   * 1. **Has it the glyphs?** A Latin file asked for Arabic returns `.notdef`
   *    for every letter, and the sheet comes out a row of empty boxes — for a
   *    job somebody has already paid for.
   * 2. **Can it be laid out naively?** opentype.js maps characters to glyphs and
   *    advances them left to right. That is the whole truth for Latin, Cyrillic
   *    and Greek. It is not for Arabic, which joins its letters into different
   *    shapes depending on their neighbours and runs right to left, nor for any
   *    script that reorders or stacks marks: there is no shaping engine here, so
   *    the outlines would be correct glyphs in the wrong forms and the wrong
   *    order. Those go to `<text>` even when the file has the glyphs.
   */
  canLayOut(font: opentype.Font, text: string): boolean {
    const letters = [...text].filter((ch) => ch !== ' ');
    if (!letters.length) return true;
    // Scripts that advance one glyph at a time, plus digits and the punctuation
    // a design is allowed. Anything else — joining, bidirectional, or carrying
    // combining marks — is not ours to lay out.
    if (!/^[\p{sc=Latin}\p{sc=Cyrillic}\p{sc=Greek}\p{N} '&.\-]+$/u.test(text)) return false;
    return letters.every((ch) => font.charToGlyphIndex(ch) > 0);
  }

  /**
   * One line of lettering as a path, drawn with its central line on y=0 and
   * centred on x=0, at the given font size. `letterSpacing` is in the same
   * units as the size. Returns the path data and the width it came out at,
   * so the caller can scale it to the width the design was measured at.
   */
  line(font: opentype.Font, text: string, fontSize: number, letterSpacing = 0): { d: string; advance: number } {
    const spacingEm = letterSpacing / fontSize;
    const advance = font.getAdvanceWidth(text, fontSize, { kerning: true, letterSpacing: spacingEm });
    // "central" in SVG is the midpoint of the em box; the outline's baseline
    // has to sit below that by half of (ascender + descender).
    const scale = fontSize / font.unitsPerEm;
    const baseline = ((font.ascender + font.descender) / 2) * scale;
    const p = font.getPath(text, -advance / 2, baseline, fontSize, { kerning: true, letterSpacing: spacingEm });
    return { d: p.toPathData(2), advance };
  }

  /** Every glyph of a line on its own, with its advance — for laying letters along an arc. */
  glyphs(font: opentype.Font, text: string, fontSize: number, letterSpacing = 0): { d: string; advance: number }[] {
    const scale = fontSize / font.unitsPerEm;
    const baseline = ((font.ascender + font.descender) / 2) * scale;
    const out: { d: string; advance: number }[] = [];
    const glyphs = font.stringToGlyphs(text);
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) * scale : 0;
      const adv = (g.advanceWidth ?? 0) * scale + kern + letterSpacing;
      out.push({ d: g.getPath(-((g.advanceWidth ?? 0) * scale) / 2, baseline, fontSize).toPathData(2), advance: adv });
    }
    return out;
  }
}
