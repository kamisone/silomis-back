import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    dto: Pick<CreateContactDto, 'name' | 'contact' | 'subject' | 'message'>,
  ) {
    return this.prisma.contact.create({ data: dto });
  }

  findAll(limit = 50) {
    return this.prisma.contact.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markRead(id: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    return this.prisma.contact.update({ where: { id }, data: { read: true } });
  }
}
