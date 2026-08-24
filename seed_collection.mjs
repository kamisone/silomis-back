import { PrismaClient } from './generated/prisma/client.js';
const prisma = new PrismaClient();

const products = await prisma.product.findMany({ where: { status: 'active', deletedAt: null }, take: 3 });
if (products.length === 0) { console.log('NO_PRODUCT'); process.exit(1); }

const collection = await prisma.collection.create({
  data: {
    slug: 'test-verify-collection',
    name: 'Verify Collection',
    description: 'A seeded collection for verifying the new page.',
    heroTitle: 'Baby Essentials',
    heroSubtitle: 'Curated must-haves for the first year',
    heroCopy: 'Hand-picked by our team, updated every season with the softest, safest picks for your little one.',
    bodyHtml: '<h2>Why we love this</h2><p>Every item here is tested for comfort and safety.</p>',
    isActive: true,
    isFeatured: false,
    sortOrder: 0,
    productLinks: {
      create: products.map((p, i) => ({ productId: p.id, sortOrder: i })),
    },
  },
});
console.log('CREATED', collection.slug, products.map(p => p.id));
await prisma.$disconnect();
