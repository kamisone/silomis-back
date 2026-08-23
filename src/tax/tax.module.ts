import { Module } from '@nestjs/common';
import { TaxService } from './tax.service';
import { TaxAdminController } from './tax-admin.controller';

@Module({
  providers: [TaxService],
  controllers: [TaxAdminController],
  exports: [TaxService],
})
export class TaxModule {}
