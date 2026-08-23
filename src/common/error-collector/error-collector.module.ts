import { Module } from '@nestjs/common';
import { ErrorCollectorService } from './error-collector.service';
import { ErrorsController } from './errors.controller';

@Module({
  controllers: [ErrorsController],
  providers: [ErrorCollectorService],
  exports: [ErrorCollectorService],
})
export class ErrorCollectorModule {}
