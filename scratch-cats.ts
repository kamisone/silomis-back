import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { buildDatabaseUrl } from './src/prisma/database-url';
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: buildDatabaseUrl()! }) });
(async () => {
  const cats = await p.embroideryMotifCategory.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { motifs: true } } } });
  for (const c of cats) console.log(c.sortOrder, c.key, JSON.stringify(c.name), '→', c._count.motifs);
  console.log('uncategorised:', await p.embroideryMotif.count({ where: { categoryId: null } }));
  await p.$disconnect();
})();
