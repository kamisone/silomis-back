import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AudienceDefinition } from './dto/campaign.dto';

const ITERATE_BATCH_SIZE = 200;

interface SubscriberRow {
  id: string;
  email: string;
}

@Injectable()
export class NewsletterSegmentationService {
  constructor(private readonly prisma: PrismaService) {}

  private audienceFragment(audience: AudienceDefinition): {
    join: Prisma.Sql;
    where: Prisma.Sql;
  } {
    switch (audience.segment) {
      case 'fr':
      case 'en':
        return {
          join: Prisma.empty,
          where: Prisma.sql`AND s.locale = ${audience.segment}`,
        };
      case 'customers':
        return {
          join: Prisma.sql`INNER JOIN shop_customers c ON LOWER(c.email) = LOWER(s.email)`,
          where: Prisma.empty,
        };
      case 'non_customers':
        return {
          join: Prisma.sql`LEFT JOIN shop_customers c ON LOWER(c.email) = LOWER(s.email)`,
          where: Prisma.sql`AND c.id IS NULL`,
        };
      case 'purchasers':
        return {
          join: Prisma.sql`INNER JOIN shop_customers c ON LOWER(c.email) = LOWER(s.email)`,
          where: Prisma.sql`AND c."totalOrders" > 0`,
        };
      case 'newsletter_only':
        return {
          join: Prisma.sql`LEFT JOIN shop_customers c ON LOWER(c.email) = LOWER(s.email) AND c."totalOrders" > 0`,
          where: Prisma.sql`AND c.id IS NULL`,
        };
      case 'tags': {
        const tags = audience.tags ?? [];
        if (tags.length === 0)
          return { join: Prisma.empty, where: Prisma.sql`AND FALSE` };
        return {
          join: Prisma.empty,
          where: Prisma.sql`AND s.tags && ARRAY[${Prisma.join(tags)}]::text[]`,
        };
      }
      case 'all':
      default:
        return { join: Prisma.empty, where: Prisma.empty };
    }
  }

  async count(audience: AudienceDefinition): Promise<number> {
    const { join, where } = this.audienceFragment(audience);
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM newsletter_subscribers s ${join}
      WHERE s.status = 'subscribed' ${where}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async *iterateSubscribers(
    audience: AudienceDefinition,
    batchSize = ITERATE_BATCH_SIZE,
  ): AsyncGenerator<SubscriberRow[]> {
    const { join, where } = this.audienceFragment(audience);
    let offset = 0;
    for (;;) {
      const batch = await this.prisma.$queryRaw<SubscriberRow[]>`
        SELECT s.id, s.email FROM newsletter_subscribers s ${join}
        WHERE s.status = 'subscribed' ${where}
        ORDER BY s.id
        LIMIT ${batchSize} OFFSET ${offset}
      `;
      if (batch.length === 0) return;
      yield batch;
      offset += batch.length;
    }
  }
}
