import { Module } from '@nestjs/common';
import { AntiSpamModule } from '../common/anti-spam/anti-spam.module';
import {
  ContactsAdminController,
  ContactsPublicController,
} from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  imports: [AntiSpamModule],
  controllers: [ContactsPublicController, ContactsAdminController],
  providers: [ContactsService],
})
export class ContactsModule {}
