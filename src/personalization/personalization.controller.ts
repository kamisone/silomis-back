import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PersonalizationService } from './personalization.service';
import { QuotePersonalizationSchema, QuotePersonalizationDto } from './dto/personalization.dto';

@Public()
@Controller('shop/personalization')
export class PersonalizationController {
  constructor(private readonly personalization: PersonalizationService) {}

  /**
   * Everything the editor needs for one product. 204 rather than 404 when the
   * product has no template: "this product is not personalisable" is an
   * ordinary answer, and a 404 in the network tab would send the next person
   * looking for a routing bug.
   */
  @Get('config/:productId')
  async config(@Param('productId') productId: string, @Query('lang') lang?: string) {
    return (await this.personalization.getConfigForProduct(productId, lang)) ?? { available: false };
  }

  /**
   * Live quote. The editor prices locally from the config so the figure moves
   * as the customer types; this is what makes that figure binding — and it
   * runs the same validation add-to-cart will, so a design that would be
   * rejected says so while they are still editing rather than at the last
   * click.
   */
  @Post('quote/:productId')
  @HttpCode(200)
  async quote(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(QuotePersonalizationSchema)) body: QuotePersonalizationDto,
    @Query('lang') lang?: string,
  ) {
    const { designs, totalCents } = await this.personalization.resolveSet(productId, body.designs, lang);
    return {
      // The total the customer is shown is the server's own sum, not one the
      // browser assembled from per-position figures it was handed.
      totalCents,
      designs: designs.map((r) => ({
        placementKey: r.placementKey,
        placementLabel: r.placementLabel,
        text: r.text,
        priceCents: r.priceCents,
        stitchEstimate: r.stitchEstimate,
        widthMm: r.widthMm,
        heightMm: r.heightMm,
        fontName: r.fontName,
        fontWeight: r.fontWeight,
        weightStep: r.weightStep,
        threadColors: r.threadColors,
        // Echoed back because the server clamps a drag that ran past the hoop's
        // edge. Without this the preview would keep showing a position the cart
        // would not store, and the customer would only find out on the cap.
        offsetXMm: r.offsetXMm,
        offsetYMm: r.offsetYMm,
        rotationDeg: r.rotationDeg,
        trackingPct: r.trackingPct,
        curveDeg: r.curveDeg,
        lineCount: r.lineCount,
        hasOutline: r.hasOutline,
        isPuff: r.isPuff,
        motif: r.motif ? { key: r.motif.key, name: r.motif.name, sizeMm: r.motif.sizeMm } : null,
      })),
    };
  }
}
