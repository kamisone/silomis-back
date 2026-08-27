import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';

/**
 * Translates admin-written English content into the shop's 6 overlay languages
 * through Google Translate's free public endpoints — no API key, no billing.
 *
 * These are the unofficial endpoints translate.google.com's own page and the
 * Chrome dictionary extension use, not the paid Cloud Translation API. They can
 * rate-limit or change without notice, but are the sole provider by design,
 * matching the reference project's approach.
 *
 * Called directly rather than through the `translate` npm package, which gave
 * no way to do the three things a deployed server needs:
 *
 *   1. Send a User-Agent. Node's fetch sends none, and a UA-less request from a
 *      datacentre IP is the exact shape Google's abuse filter answers with its
 *      "unusual traffic" HTML page — the same request from a browser, with a
 *      browser's headers, is served normally.
 *   2. See the HTTP status. The package piped every response into `res.json()`,
 *      so a 429 or an interstitial surfaced as `Unexpected token '<'`, which
 *      reads like a parsing bug rather than a refusal.
 *   3. Fall back. If one host refuses, another may not.
 *
 * Dropping it also removes the `new Function('return import(...)')` hack that
 * pure-ESM package needed to load from this CommonJS build.
 */

/**
 * The provider refused this server rather than this request.
 *
 * These endpoints are gated by client IP and request shape: a browser gets
 * JSON, an anonymous request from a datacentre address gets the "unusual
 * traffic" interstitial — an HTML page, sometimes under a 200. Because the old
 * client piped every response straight into `res.json()`, that page surfaced as
 * `Unexpected token '<'`, which reads like a bug in our parsing rather than a
 * door being closed.
 *
 * Kept distinct from a transient failure because the two want opposite
 * handling: a rate-limit clears if you wait, a refusal does not.
 */
export class TranslationProviderBlockedError extends Error {
  constructor() {
    super(
      'The translation provider refused this server: it returned its "unusual traffic" page instead of a ' +
        'translation. This is IP-based blocking of the free endpoints — it typically works from a laptop and ' +
        'not from a deployed server, and does not clear by retrying.',
    );
    this.name = 'TranslationProviderBlockedError';
  }
}

/** Sent on every request. A real browser UA and language header — the previous
 *  client sent neither, which is what an abuse filter scores hardest. */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const REQUEST_TIMEOUT_MS = 12_000;

/**
 * The two endpoints, in order of preference. They return different shapes, so
 * each carries its own parser.
 *
 * `gtx` is the richer one (translate.google.com's own). `dict-chrome-ex` is a
 * different host answering a different client id, which is worth trying second
 * precisely because it is gated separately.
 */
const ENDPOINTS: ReadonlyArray<{
  name: string;
  url: (text: string, to: string) => string;
  parse: (body: unknown) => string;
}> = [
  {
    name: 'translate.googleapis.com',
    url: (text, to) =>
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`,
    // [[["translated","source",…], …], …] — one entry per sentence, joined back.
    parse: (body) => {
      const segments =
        Array.isArray(body) && Array.isArray(body[0])
          ? (body[0] as unknown[])
          : [];
      return segments
        .map((seg) => (Array.isArray(seg) ? String(seg[0] ?? '') : ''))
        .join('');
    },
  },
  {
    name: 'clients5.google.com',
    url: (text, to) =>
      `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(text)}`,
    // ["translated"] — or [["translated","source"]] for longer input.
    parse: (body) => {
      if (!Array.isArray(body)) return '';
      const first = body[0];
      if (typeof first === 'string')
        return body.filter((s) => typeof s === 'string').join('');
      if (Array.isArray(first))
        return first
          .map((seg) => (Array.isArray(seg) ? String(seg[0] ?? '') : ''))
          .join('');
      return '';
    },
  },
];

@Injectable()
export class FreeTranslateService {
  private readonly logger = new Logger(FreeTranslateService.name);

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
      // A closed door is not a transient failure: every endpoint has already
      // been tried, and retrying a refusal only doubles the wait before the
      // same answer. A genuine wobble still gets its second chance.
      if (err instanceof TranslationProviderBlockedError) throw err;
      this.logger.warn(
        `translateText(${to}) failed once, retrying: ${(err as Error).message}`,
      );
      await sleep(1200);
      return this.translateOnce(text, to);
    }
  }

  /**
   * One pass over the endpoints, in order, returning the first real answer.
   *
   * A refusal from the first host is not fatal — the second is gated
   * separately — so the loop notes it and moves on, and only reports "blocked"
   * once every host has refused.
   */
  private async translateOnce(text: string, to: string): Promise<string> {
    let blocked: TranslationProviderBlockedError | null = null;
    let lastError: Error | null = null;

    for (const endpoint of ENDPOINTS) {
      try {
        const body = await this.fetchJson(
          endpoint.url(text, to),
          endpoint.name,
        );
        const result = endpoint.parse(body);
        if (!result.trim())
          throw new Error(`${endpoint.name} returned empty text`);
        return result;
      } catch (err) {
        if (err instanceof TranslationProviderBlockedError) {
          blocked = err;
          this.logger.warn(
            `${endpoint.name} refused this server; trying the next endpoint.`,
          );
          continue;
        }
        lastError = err as Error;
        this.logger.warn(`${endpoint.name} failed: ${lastError.message}`);
      }
    }

    // Every host refused and nothing else went wrong: that is the blocked case.
    if (blocked && !lastError) throw blocked;
    throw lastError ?? blocked ?? new Error('translation failed');
  }

  /**
   * Fetches and parses one endpoint, distinguishing a refusal from a fault.
   *
   * Status and content type are checked *before* parsing, so a 429 or an HTML
   * interstitial is reported as what it is rather than as a JSON syntax error
   * thrown from somewhere inside a dependency.
   */
  private async fetchJson(url: string, name: string): Promise<unknown> {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // 429 (rate limited) and 403 (refused) both mean "not you, not now".
    if (res.status === 429 || res.status === 403) {
      this.logger.warn(
        `${name} returned HTTP ${res.status} — the endpoint is refusing this server.`,
      );
      throw new TranslationProviderBlockedError();
    }
    if (!res.ok) throw new Error(`${name} returned HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') ?? '';
    const raw = await res.text();

    // The abuse interstitial arrives as an HTML document, often with a 200.
    if (!contentType.includes('json') && raw.trimStart().startsWith('<')) {
      this.logger.warn(
        `${name} returned an HTML page instead of JSON (content-type: ${contentType || 'none'}).`,
      );
      throw new TranslationProviderBlockedError();
    }

    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error(
        `${name} returned an unparseable body (content-type: ${contentType || 'none'})`,
      );
    }
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
   * vocabulary (<p>, <h1>–<h6>, <ul>/<ol>/<li> as blocks; <strong>, <em>,
   * <b>, <i>, <u>, <s>, <span>, <a> inline) — inline tags are assumed not to
   * nest inside each other. Anything not in that set is dropped from the
   * block, so a new toolbar button means a new entry here.
   */
  async translateHtml(html: string, to: string): Promise<string> {
    const $ = cheerio.load(html);
    const blocks = $('body').find('p, h1, h2, h3, h4, h5, h6, li').toArray();

    for (const block of blocks) {
      const $block = $(block);
      const tags: InlineTag[] = [];
      const placeholderText = buildPlaceholderText($, block, tags);
      if (!placeholderText.trim()) continue;

      const translated = await this.translateText(placeholderText, to);
      $block.html(restoreInlineTags(translated, tags));
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

const INLINE_TAGS = new Set(['strong', 'em', 'b', 'i', 'u', 's', 'span', 'a']);

/**
 * One inline tag pulled out of a block: its name, for the closing tag, and its
 * *whole* opening tag, attributes included.
 *
 * The opening tag is kept verbatim rather than rebuilt from the name because
 * the hero's inline editor colours words with `<span style="color: …">` — a
 * side channel holding only "span" would put the tag back stripped of the very
 * thing it was there for.
 */
interface InlineTag {
  name: string;
  open: string;
}

/**
 * Flattens a block element's children into one plain string, replacing each
 * inline tag with a `⟦N⟧...⟦/N⟧` numeric placeholder pair (N = its index in
 * `tags`, appended as a side effect) so the whole block can be translated as a
 * single unit while still knowing where to put the original tags back
 * afterward.
 */
function buildPlaceholderText(
  $: cheerio.CheerioAPI,
  block: Element,
  tags: InlineTag[],
): string {
  let out = '';
  $(block)
    .contents()
    .each((_, node) => {
      if (node.type === 'text') {
        out += node.data;
      } else if (node.type === 'tag' && INLINE_TAGS.has(node.tagName)) {
        const html = $.html(node);
        const open = html.slice(0, html.indexOf('>') + 1);
        const i = tags.push({ name: node.tagName, open }) - 1;
        out += `⟦${i}⟧${$(node).text()}⟦/${i}⟧`;
      }
    });
  return out;
}

/** Reverses buildPlaceholderText's substitution on translated text. */
function restoreInlineTags(text: string, tags: InlineTag[]): string {
  return text.replace(
    /⟦(\/?)(\d+)⟧/g,
    (match, closing: string, indexStr: string) => {
      const tag = tags[Number(indexStr)];
      if (!tag) return match;
      return closing ? `</${tag.name}>` : tag.open;
    },
  );
}
