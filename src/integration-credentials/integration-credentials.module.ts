import { Module } from '@nestjs/common';
import { IntegrationCredentialsService } from './integration-credentials.service';
import { IntegrationCredentialsController } from './integration-credentials.controller';

@Module({
  controllers: [IntegrationCredentialsController],
  providers: [IntegrationCredentialsService],
  exports: [IntegrationCredentialsService],
})
export class IntegrationCredentialsModule {}
