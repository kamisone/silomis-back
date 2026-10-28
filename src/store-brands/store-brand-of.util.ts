import { PrismaService } from '../prisma/prisma.service';

/**
 * The brand an order of these products is sold under — read when the order
 * is created and stored on it, so its emails, tracking page and bank
 * statement keep the brand even if the product is later moved.
 *
 * A basket holds one brand's products only (CartService.addItem), so the
 * first branded product decides. Silomis (null) otherwise.
 */
export async function storeBrandIdForProducts(
  prisma: PrismaService,
  productIds: string[],
): Promise<string | null> {
  if (!productIds.length) return null;
  const branded = await prisma.product.findFirst({
    where: {
      id: { in: productIds },
      storeBrandId: { not: null },
      storeBrand: { isActive: true },
    },
    select: { storeBrandId: true },
  });
  return branded?.storeBrandId ?? null;
}

/** The name to sign a text with: the brand's, or null for Silomis. */
export async function storeBrandName(
  prisma: PrismaService,
  storeBrandId: string | null | undefined,
): Promise<string | null> {
  if (!storeBrandId) return null;
  const brand = await prisma.storeBrand.findUnique({
    where: { id: storeBrandId },
    select: { name: true, isActive: true },
  });
  return brand?.isActive ? brand.name : null;
}

/** The brand name for a basket's texts (checkout code, abandoned-cart reminder), before any order exists. */
export async function storeBrandNameForCart(
  prisma: PrismaService,
  cartToken: string,
): Promise<string | null> {
  const cart = await prisma.cart.findUnique({
    where: { token: cartToken },
    select: { items: { select: { productId: true } } },
  });
  if (!cart) return null;
  return storeBrandName(
    prisma,
    await storeBrandIdForProducts(
      prisma,
      cart.items.map((i) => i.productId),
    ),
  );
}
