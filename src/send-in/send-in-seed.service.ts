import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TEMPLATE_KEY } from '../personalization/personalization.seed';
import { SEND_IN_ITEM_TYPES, SEND_IN_PLACEMENT_KEYS, SEND_IN_PRODUCT_SLUG } from './send-in.constants';
import { ET_SHOP_PRODUCT } from '../translations/translation-entities';

/** The service product's name, in every language the shop speaks — the base row is French like every other product. */
const SEND_IN_PRODUCT_TITLE: Record<string, string> = {
  fr: 'Broderie sur votre propre article',
  en: 'Embroidery on your own item',
  es: 'Bordado en tu propio artículo',
  it: 'Ricamo sul tuo articolo',
  de: 'Stickerei auf Ihrem eigenen Artikel',
  nl: 'Borduurwerk op je eigen artikel',
  pl: 'Haft na Twoim własnym artykule',
};
const SEND_IN_PRODUCT_DESCRIPTION: Record<string, string> = {
  fr: 'Envoyez-nous une casquette, un bonnet, une veste ou un sac que vous avez déjà et nous y brodons votre design.',
  en: 'Post us a cap, beanie, jacket or bag you already own and we embroider your design on it.',
  es: 'Envíanos una gorra, un gorro, una chaqueta o un bolso que ya tengas y bordamos tu diseño en él.',
  it: 'Spediscici un cappellino, un berretto, una giacca o una borsa che già possiedi e ci ricamiamo il tuo design.',
  de: 'Schicken Sie uns eine Kappe, Mütze, Jacke oder Tasche, die Sie bereits besitzen, und wir sticken Ihr Design darauf.',
  nl: 'Stuur ons een pet, muts, jas of tas die je al hebt en wij borduren je ontwerp erop.',
  pl: 'Wyślij nam czapkę, kurtkę lub torbę, którą już masz, a my wyhaftujemy na niej Twój projekt.',
};

/**
 * Puts the send-in service product in place on boot.
 *
 * The service is sold as one hidden catalogue product — one variant per item
 * type, carrying the handling and return price — so that carts, checkout,
 * payment, receipts and the production queue all treat it as an ordinary
 * personalised line. Created once; after that the admin owns it (prices,
 * whether it is active), and this only adds an item type the seed has gained.
 */
@Injectable()
export class SendInSeedService implements OnModuleInit {
  private readonly logger = new Logger(SendInSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(`Send-in seed failed: ${(err as Error).message}`);
    }
  }

  async seed(): Promise<void> {
    const template = await this.prisma.personalizationTemplate.findUnique({ where: { key: DEFAULT_TEMPLATE_KEY } });
    if (!template) return; // The personalization seed runs first; if it has not, there is nothing to attach to.

    let product = await this.prisma.product.findUnique({ where: { slug: SEND_IN_PRODUCT_SLUG }, include: { variants: true, placements: true } });
    if (!product) {
      product = await this.prisma.product.create({
        data: {
          slug: SEND_IN_PRODUCT_SLUG,
          sku: 'SENDIN',
          title: SEND_IN_PRODUCT_TITLE.fr,
          shortDescription: SEND_IN_PRODUCT_DESCRIPTION.fr,
          isService: true,
          status: 'active',
          publishedAt: new Date(),
          basePriceCents: SEND_IN_ITEM_TYPES[0].priceCents,
          personalizationTemplateId: template.id,
        },
        include: { variants: true, placements: true },
      });
      this.logger.log(`Seeded send-in service product "${SEND_IN_PRODUCT_SLUG}"`);
    }

    // The name in every language, on the same translation rows every other
    // product uses — so the basket, the confirmation and the tracking page
    // read it in the customer's language, not in the seed's. A base row
    // still carrying the first seed's English name is moved to French.
    if (product.title === 'Embroidery on your own item') {
      await this.prisma.product.update({ where: { id: product.id }, data: { title: SEND_IN_PRODUCT_TITLE.fr, shortDescription: SEND_IN_PRODUCT_DESCRIPTION.fr } });
    }
    for (const [lang, value] of Object.entries(SEND_IN_PRODUCT_TITLE)) {
      await this.prisma.translation.upsert({
        where: { entityType_entityId_field_lang: { entityType: ET_SHOP_PRODUCT, entityId: product.id, field: 'title', lang } },
        create: { entityType: ET_SHOP_PRODUCT, entityId: product.id, field: 'title', lang, value },
        update: {},
      });
      await this.prisma.translation.upsert({
        where: { entityType_entityId_field_lang: { entityType: ET_SHOP_PRODUCT, entityId: product.id, field: 'shortDescription', lang } },
        create: { entityType: ET_SHOP_PRODUCT, entityId: product.id, field: 'shortDescription', lang, value: SEND_IN_PRODUCT_DESCRIPTION[lang] },
        update: {},
      });
    }

    // The starting list of item types, once. From then on the list is the
    // admin's: a type deleted in the admin stays deleted, and the seed only
    // fills an empty table.
    const existing = await this.prisma.sendInItemType.count();
    if (existing === 0) {
      let added = 0;
      for (const [i, type] of SEND_IN_ITEM_TYPES.entries()) {
        let variant = product.variants.find((v) => v.sku === type.sku) ?? null;
        if (!variant) {
          variant = await this.prisma.productVariant.create({
            data: {
              productId: product.id,
              sku: type.sku,
              title: type.label.en,
              // The fee is per side and lives on the item type; the variant
              // only exists so checkout has a line to sell.
              priceCents: 0,
              isDefault: i === 0,
              sortOrder: i * 10,
              combinationHash: `send-in:${type.key}`,
            },
          });
          // A service has no stock, but the cart insists on a stock row: give
          // it one that never runs out.
          await this.prisma.inventoryItem.create({ data: { variantId: variant.id, productId: product.id, available: 1_000_000, lowStockThreshold: 0 } });
        }
        await this.prisma.sendInItemType.create({
          data: {
            key: type.key,
            label: type.label,
            variantId: variant.id,
            priceCents: type.priceCents,
            maxChars: type.maxChars,
            allowPuff: type.allowPuff,
            sortOrder: i * 10,
          },
        });
        added++;
      }
      this.logger.log(`Seeded ${added} send-in item type(s)`);
    }

    // One position per side the customer may photograph. No photo of their
    // own — the customer's upload stands in — and a generous field, since the
    // editor replaces it with the item type's panel.
    const sideLabels: Record<string, Record<string, string>> = {
      'side-1': { en: 'Side 1', fr: 'Face 1', es: 'Lado 1', it: 'Lato 1', de: 'Seite 1', nl: 'Kant 1', pl: 'Strona 1' },
      'side-2': { en: 'Side 2', fr: 'Face 2', es: 'Lado 2', it: 'Lato 2', de: 'Seite 2', nl: 'Kant 2', pl: 'Strona 2' },
      'side-3': { en: 'Side 3', fr: 'Face 3', es: 'Lado 3', it: 'Lato 3', de: 'Seite 3', nl: 'Kant 3', pl: 'Strona 3' },
    };
    for (const [i, key] of SEND_IN_PLACEMENT_KEYS.entries()) {
      if (product.placements.some((p) => p.key === key)) continue;
      await this.prisma.personalizationPlacement.create({
        data: {
          productId: product.id,
          key,
          label: sideLabels[key],
          fieldWidthMm: 200,
          fieldHeightMm: 150,
          maxColors: 6,
          maxChars: 24,
          priceCents: 0,
          allowPuff: true,
          usesCustomerPhoto: true,
          isActive: true,
          sortOrder: i * 10,
        },
      });
    }
    // The single position of the first version is retired, not deleted:
    // orders placed on it still point at it.
    const legacy = product.placements.find((p) => p.key === 'item' && p.isActive);
    if (legacy) await this.prisma.personalizationPlacement.update({ where: { id: legacy.id }, data: { isActive: false } });
  }
}
