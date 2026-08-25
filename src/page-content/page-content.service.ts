import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageContent } from '../../generated/prisma/client';

export interface PageSection {
  title: string;
  body: string;
}

export interface PageContentData {
  title: string;
  intro: string;
  sections: PageSection[];
  stats?: { num: string; label: string }[];
}

@Injectable()
export class PageContentService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<PageContent[]> {
    return this.prisma.pageContent.findMany({
      orderBy: [{ slug: 'asc' }, { locale: 'asc' }],
    });
  }

  findOne(slug: string, locale: string): Promise<PageContent | null> {
    return this.prisma.pageContent.findUnique({
      where: { slug_locale: { slug, locale } },
    });
  }

  upsert(
    slug: string,
    locale: string,
    data: PageContentData,
  ): Promise<PageContent> {
    return this.prisma.pageContent.upsert({
      where: { slug_locale: { slug, locale } },
      create: { slug, locale, data: data as object },
      update: { data: data as object },
    });
  }
}
