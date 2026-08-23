import { Controller, Get } from '@nestjs/common';
import { ErrorCollectorService } from './error-collector.service';

@Controller('errors')
export class ErrorsController {
  constructor(private readonly collector: ErrorCollectorService) {}

  @Get()
  findAll() {
    return this.collector.getAll();
  }
}
