import { Injectable, Logger } from '@nestjs/common';
import {
  FreeTranslateService,
  TranslationProviderBlockedError,
} from './free-translate.service';

/**
 * The shop's 6 non-English display languages — everything a product needs
 * translated once an admin has written a section in English, the shop's
 * base/source language and the sole input language for every "Generate"
 * button on the product-edit page.
 */
export type SectionTranslationLang = 'fr' | 'es' | 'it' | 'de' | 'nl' | 'pl';

const SECTION_TARGET_LANGS: SectionTranslationLang[] = [
  'fr',
  'es',
  'it',
  'de',
  'nl',
  'pl',
];

/**
 * Result of translating one section/item into all 6 languages. `errors` is
 * only populated for languages that failed — the admin needs to actually see
 * *why* a language came back empty instead of it silently looking like the
 * button just didn't do anything. A failed language's `result` entry is
 * still present (set to `emptyValue`) so callers can always safely read
 * `result[lang]` without an undefined-access crash.
 */
export interface SectionTranslationOutcome<T> {
  result: Record<SectionTranslationLang, T>;
  errors: Partial<Record<SectionTranslationLang, string>>;
}

/**
 * Powers every "Generate" button across the shop admin (product title,
 * short description, description, specifications, FAQs, story gallery,
 * trust badges, social videos): the admin writes the English source, clicks
 * Generate, and gets all 6 overlay languages back — via free Google
 * Translate (see FreeTranslateService).
 */

/** Shown next to the Generate button. Says what is wrong and that retrying is
 *  not the fix — "try again" would send the admin round a loop that cannot end
 *  well while the server's IP is refused. */
const BLOCKED_MESSAGE =
  'Translation service unavailable from the server. Retrying will not help — this needs a supported translation provider configured.';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(private readonly freeTranslate: FreeTranslateService) {}

  async translateTitle(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'title',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  async translateShortDescription(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'short_description',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /** The heading shown above the Story Gallery's Narrative section. */
  async translateStoryNarrativeTitle(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'story_narrative_title',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /** The heading shown above the Social Videos carousel. */
  async translateSocialVideosTitle(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'social_videos_title',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /**
   * Field-agnostic plain-text translate.
   *
   * The per-field methods above exist because their callers translate one named
   * thing. The home-page and hero editors translate whatever field the admin
   * happens to be standing in — a heading, an eyebrow, a button label — so they
   * ask for copy, not for a field.
   */
  async translateCopy(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'copy',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /** As translateCopy, for a rich-text field whose value is HTML. */
  async translateCopyHtml(
    html: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'copy_html',
      (lang) => this.freeTranslate.translateHtml(html, lang),
      '',
    );
  }

  async translateDescription(
    html: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'description',
      (lang) => this.freeTranslate.translateHtml(html, lang),
      '',
    );
  }

  /** One card, one click: translates a single specification entry (label + value). */
  async translateInfoSection(item: {
    label: string;
    value: string;
  }): Promise<SectionTranslationOutcome<{ label: string; value: string }>> {
    return this.translateSection(
      'info_section',
      async (lang) => ({
        label: await this.freeTranslate.translateText(item.label, lang),
        value: await this.freeTranslate.translateText(item.value, lang),
      }),
      { label: '', value: '' },
    );
  }

  /** One card, one click: translates a single FAQ entry (question + answer). */
  async translateFaq(item: {
    question: string;
    answer: string;
  }): Promise<SectionTranslationOutcome<{ question: string; answer: string }>> {
    return this.translateSection(
      'faq',
      async (lang) => ({
        question: await this.freeTranslate.translateText(item.question, lang),
        answer: await this.freeTranslate.translateText(item.answer, lang),
      }),
      { question: '', answer: '' },
    );
  }

  /** One card, one click: translates a single story-gallery block (title + description). */
  /**
   * The description is rich text (the admin writes it in the WYSIWYG), so it
   * goes through `translateHtml` — which walks the text nodes and leaves the
   * markup alone. Sending it through `translateText` would hand the raw
   * `<p><strong>…` to the translator as a sentence and get the tags back
   * mangled or dropped.
   */
  async translateStoryItem(item: {
    title: string;
    description: string;
  }): Promise<
    SectionTranslationOutcome<{ title: string; description: string }>
  > {
    return this.translateSection(
      'story_item',
      async (lang) => ({
        title: await this.freeTranslate.translateText(item.title, lang),
        description: await this.freeTranslate.translateHtml(
          item.description,
          lang,
        ),
      }),
      { title: '', description: '' },
    );
  }

  /** One card, one click: translates a single trust badge (title + optional subtitle). */
  async translateTrustBadge(item: {
    title: string;
    subtitle: string;
  }): Promise<SectionTranslationOutcome<{ title: string; subtitle: string }>> {
    return this.translateSection(
      'trust_badge',
      async (lang) => ({
        title: await this.freeTranslate.translateText(item.title, lang),
        subtitle: item.subtitle.trim()
          ? await this.freeTranslate.translateText(item.subtitle, lang)
          : '',
      }),
      { title: '', subtitle: '' },
    );
  }

  /** One card, one click: translates a single social video's title/badge. */
  async translateSocialVideo(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'social_video',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /** Variant attribute name (e.g. "Color", "Size"). */
  async translateAttributeName(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'variant_attribute_name',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /** Option value display label (e.g. "Black", "Extra Large"). */
  async translateOptionDisplayValue(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'option_display_value',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /** Category filter name (e.g. "Material", "Fit"). */
  async translateCategoryFilterName(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'category_filter_name',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /** Category filter value label (e.g. "Cotton", "Slim"). */
  async translateCategoryFilterValueLabel(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'category_filter_value_label',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /** Country display name (e.g. "France", "Morocco"). */
  async translateCountryName(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'country_name',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /** Promotion name — shown to shoppers on the storefront promotion badge. */
  async translatePromotionName(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'promotion_name',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /** Promotion description. */
  async translatePromotionDescription(
    text: string,
  ): Promise<SectionTranslationOutcome<string>> {
    return this.translateSection(
      'promotion_description',
      (lang) => this.freeTranslate.translateText(text, lang),
      '',
    );
  }

  /**
   * Shared per-language loop: one call per target language, run
   * sequentially (not in parallel) so this doesn't burst 6 simultaneous
   * requests at Google Translate's free, unofficial, rate-limit-sensitive
   * endpoint. A single language failing doesn't take the other five down
   * with it — it gets `emptyValue` (the caller/UI treats empty as "admin
   * fills it in manually") *and* a human-readable reason in `errors`.
   */
  private async translateSection<T>(
    name: string,
    translateOne: (lang: SectionTranslationLang) => Promise<T>,
    emptyValue: T,
  ): Promise<SectionTranslationOutcome<T>> {
    const result = {} as Record<SectionTranslationLang, T>;
    const errors: Partial<Record<SectionTranslationLang, string>> = {};

    // Once the provider has refused the server, it will refuse it for every
    // remaining language too — so the first block ends the loop instead of
    // spending five more round trips to be told the same thing.
    let blocked = false;

    for (const lang of SECTION_TARGET_LANGS) {
      if (blocked) {
        result[lang] = emptyValue;
        errors[lang] = BLOCKED_MESSAGE;
        continue;
      }
      try {
        result[lang] = await translateOne(lang);
      } catch (err) {
        result[lang] = emptyValue;
        if (err instanceof TranslationProviderBlockedError) {
          blocked = true;
          this.logger.error(
            `${name}: translation provider blocked this server — skipping remaining languages.`,
          );
          errors[lang] = BLOCKED_MESSAGE;
          continue;
        }
        this.logger.warn(`${name}_${lang} failed: ${(err as Error).message}`);
        errors[lang] = 'Translation failed — try again.';
      }
    }

    return { result, errors };
  }
}
