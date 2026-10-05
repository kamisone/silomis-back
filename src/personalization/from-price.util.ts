import { PrismaService } from '../prisma/prisma.service';

/**
 * The lowest embroidery price a product can be personalised for — what the
 * "Personalise" buttons show as "from €X" before the customer opens the
 * editor.
 *
 * It is a real, reachable price, not a guess: embroidery costs each position's
 * own price (PersonalizationService.resolve), plain text adds nothing, and only
 * a motif adds a surcharge. So the cheapest position the editor offers is the
 * cheapest design there is. "Offers" mirrors getConfigForProduct: active, and
 * with a photograph to place the design on. Send-in positions (the customer's
 * own photo) are left out — they belong to the send-in service, not to this
 * product's editor.
 *
 * Products with nothing to offer are absent from the map.
 */
export async function personalizationFromPrices(prisma: PrismaService, productIds: string[]): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const rows = await prisma.personalizationPlacement.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, isActive: true, usesCustomerPhoto: false, mediaKey: { not: null } },
    _min: { priceCents: true },
  });
  return new Map(rows.filter((r) => r._min.priceCents !== null).map((r) => [r.productId, r._min.priceCents as number]));
}
