import { Module } from '@nestjs/common';
import { PriceRulesService } from './price-rules.service';
import { PriceRulesAdminController } from './price-rules-admin.controller';

@Module({
  providers: [PriceRulesService],
  controllers: [PriceRulesAdminController],
  exports: [PriceRulesService],
})
export class PriceRulesModule {}
