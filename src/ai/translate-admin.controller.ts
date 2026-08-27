import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TranslationService } from './translation.service';

const TranslateTextSchema = z.object({ text: z.string().min(1).max(5000) });
const TranslateHtmlSchema = z.object({ html: z.string().min(1).max(50000) });

/**
 * One "Generate" endpoint for every admin field that has no reason to be
 * special.
 *
 * The older per-field routes (`products/sections/title/translate`,
 * `countries/sections/name/translate`, …) exist because those fields once
 * needed their own prompt or shape. Most do not: a category name, a collection
 * heading and a media asset's alt text are all just copy, and giving each of
 * them a route of its own meant a backend deploy every time a field gained a
 * Generate button. This is the route those fields share.
 *
 * `translateCopy` / `translateCopyHtml` are the same service methods the
 * hero-slide and home-section controllers already call.
 */
@Controller('admin/shop/translate')
export class TranslateAdminController {
  constructor(private readonly translation: TranslationService) {}

  /** Plain copy: a name, a heading, a button label, an alt text. */
  @Post('text')
  translateText(
    @Body(new ZodValidationPipe(TranslateTextSchema))
    dto: z.infer<typeof TranslateTextSchema>,
  ) {
    return this.translation.translateCopy(dto.text);
  }

  /** A rich-text field, whose value is markup rather than a string. */
  @Post('html')
  translateHtml(
    @Body(new ZodValidationPipe(TranslateHtmlSchema))
    dto: z.infer<typeof TranslateHtmlSchema>,
  ) {
    return this.translation.translateCopyHtml(dto.html);
  }
}
