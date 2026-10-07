import { PrismaService } from '../prisma/prisma.service';
import { pickLocalized } from './localized.util';

/**
 * What a "Personalise" button says about price before the customer opens the
 * editor: "from €X", and which positions the shop embroiders for free.
 */
export interface PersonalizationOffer {
  /**
   * The lowest embroidery price the product can be personalised for.
   *
   * It is a real, reachable price, not a guess: embroidery costs each
   * position's own price (PersonalizationService.resolve), plain text adds
   * nothing, and only a motif adds a surcharge. So the cheapest position the
   * editor offers is the cheapest design there is.
   */
  fromCents: number;
  /**
   * Names of the positions priced at zero, in the request's language and in
   * the editor's order — what lets a button say "Free on the front panel"
   * rather than a bare "Free" that would read as "every position is free".
   */
  freePositions: string[];
  /** Every position the editor offers is free — the button can drop the names. */
  allFree: boolean;
}

/**
 * The offer for each product, for the product page's "Personalise this piece"
 * button and the basket's "Add embroidery" offers.
 *
 * "Offers" mirrors getConfigForProduct: active, and with a photograph to place
 * the design on. Send-in positions (the customer's own photo) are left out —
 * they belong to the send-in service, not to this product's editor.
 *
 * Products with nothing to offer are absent from the map.
 */
export async function personalizationOffers(
  prisma: PrismaService,
  productIds: string[],
  lang?: string,
): Promise<Map<string, PersonalizationOffer>> {
  if (!productIds.length) return new Map();
  const rows = await prisma.personalizationPlacement.findMany({
    where: { productId: { in: productIds }, isActive: true, usesCustomerPhoto: false, mediaKey: { not: null } },
    select: { productId: true, priceCents: true, label: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const byProduct = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byProduct.get(row.productId);
    if (list) list.push(row);
    else byProduct.set(row.productId, [row]);
  }

  const offers = new Map<string, PersonalizationOffer>();
  for (const [productId, placements] of byProduct) {
    const free = placements.filter((p) => p.priceCents === 0);
    offers.set(productId, {
      fromCents: Math.min(...placements.map((p) => p.priceCents)),
      freePositions: free.map((p) => pickLocalized(p.label, lang)).filter(Boolean),
      allFree: free.length === placements.length,
    });
  }
  return offers;
}
