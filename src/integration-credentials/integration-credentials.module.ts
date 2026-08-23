import { Module } from '@nestjs/common';
import { IntegrationCredentialsService } from './integration-credentials.service';

@Module({
  providers: [IntegrationCredentialsService],
  exports: [IntegrationCredentialsService],
})
export class IntegrationCredentialsModule {}
