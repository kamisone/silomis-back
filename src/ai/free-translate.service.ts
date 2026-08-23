import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';

/**
 * Translates admin-written English product content into the shop's 6
 * overlay languages via Google Translate's free public web endpoint (no API
 * key, no billing — the `translate` npm package's default "google" engine).
 * This is an unofficial, unsupported endpoint (the same one translate.google.com's
 * page uses), not the paid Cloud Translation API — it can rate-limit or
 * change without notice, but is the sole translation provider by design,
 * matching the reference project's own approach (see vitecamio's
 * FreeTranslateService — Gemini/Groq were tried there and removed).
 *
 * `translate` is a pure ESM package; this backend compiles to CommonJS. A
 * plain `await import('translate')` looks safe but isn't — TypeScript
 * downlevels dynamic `import()` to a Promise-wrapped `require()` when
 * targeting CommonJS, which throws ERR_REQUIRE_ESM on a pure-ESM package at
 * runtime. The `new Function(...)` indirection below is the standard
 * workaround: code inside it isn't touched by TypeScript's static rewrite,
 * so it reaches Node's real native dynamic import.
 */
@Injectable()
export class FreeTranslateService {
  private readonly logger = new Logger(FreeTranslateService.name);
  private translateFn: ((text: string, to: string) => Promise<string>) | null = null;

  private async getTranslateFn() {
    if (!this.translateFn) {
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (
        specifier: string,
      ) => Promise<typeof import('translate')>;
      const { Translate } = await dynamicImport('translate');
      const instance = Translate({ engine: 'google', from: 'en' });
      this.translateFn = (text: string, to: string) => instance(text, { to });
    }
    return this.translateFn;
  }

  /**
   * Translates a single plain-text string. Retries once after a short delay
   * on failure — the free endpoint occasionally 429s ("unusual traffic")
   * under normal use, and a lone transient block often clears within a
   * second; a sustained block will just fail the same way twice and bubble
   * up to the caller's existing per-language error handling either way.
   */
  async translateText(text: string, to: string): Promise<string> {
    try {
      return await this.translateOnce(text, to);
    } catch (err) {
      this.logger.warn(`translateText(${to}) failed once, retrying: ${(err as Error).message}`);
      await sleep(1200);
      return this.translateOnce(text, to);
    }
  }

  private async translateOnce(text: string, to: string): Promise<string> {
    const fn = await this.getTranslateFn();
    const result = await fn(text, to);
    if (!result.trim()) {
      throw new Error('translate returned empty text');
    }
    return result;
  }

  /**
   * Translates an HTML fragment without risking mangled markup or broken
   * grammar. Each block-level element (<p>, <h2>, <h3>, <li>) is translated
   * as a single coherent sentence/phrase — never as disconnected text-node
   * fragments, which loses both the whitespace around inline tags and the
   * grammatical context a translator needs.
   *
   * Inline tags (<strong>, <em>) within a block are swapped for distinctive
   * numeric placeholder tokens (⟦0⟧...⟦/0⟧) before translation — Google
   * Translate preserves these tokens, and their position/surrounding
   * spacing, while translating the full sentence around them coherently.
   * Numeric tokens specifically, not the tag name itself — a tag name like
   * `⟦strong⟧` is a real English word Google Translate happily translates
   * too, breaking the token. A number isn't a translatable word, so it
   * survives intact; a side-channel array maps each index back to its
   * original tag name afterward. Safe for this product's fixed tag
   * vocabulary (<p>, <h2>, <h3>, <strong>, <em>, <ul>/<ol>/<li>) — inline
   * tags are assumed not to nest inside each other.
   */
  async translateHtml(html: string, to: string): Promise<string> {
    const $ = cheerio.load(html);
    const blocks = $('body').find('p, h2, h3, li').toArray();

    for (const block of blocks) {
      const $block = $(block);
      const tagNames: string[] = [];
      const placeholderText = buildPlaceholderText($, block, tagNames);
      if (!placeholderText.trim()) continue;

      const translated = await this.translateText(placeholderText, to);
      $block.html(restoreInlineTags(translated, tagNames));
    }

    const result = $('body').html() ?? '';
    if (!result.trim()) {
      throw new Error('translateHtml produced empty output');
    }
    return result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const INLINE_TAGS = new Set(['strong', 'em']);

/**
 * Flattens a block element's children into one plain string, replacing each
 * inline tag with a `⟦N⟧...⟦/N⟧` numeric placeholder pair (N = its index in
 * `tagNames`, appended as a side effect) so the whole block can be
 * translated as a single unit while still knowing where to put the original
 * tags back afterward.
 */
function buildPlaceholderText($: cheerio.CheerioAPI, block: Element, tagNames: string[]): string {
  let out = '';
  $(block)
    .contents()
    .each((_, node) => {
      if (node.type === 'text') {
        out += node.data;
      } else if (node.type === 'tag' && INLINE_TAGS.has(node.tagName)) {
        const i = tagNames.push(node.tagName) - 1;
        out += `⟦${i}⟧${$(node).text()}⟦/${i}⟧`;
      }
    });
  return out;
}

/** Reverses buildPlaceholderText's substitution on translated text. */
function restoreInlineTags(text: string, tagNames: string[]): string {
  return text.replace(/⟦(\/?)(\d+)⟧/g, (match, closing: string, indexStr: string) => {
    const tag = tagNames[Number(indexStr)];
    if (!tag) return match;
    return closing ? `</${tag}>` : `<${tag}>`;
  });
}
