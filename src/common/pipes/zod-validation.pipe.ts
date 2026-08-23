import { BadRequestException, Injectable, Logger, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  private readonly logger = new Logger(ZodValidationPipe.name);

  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      this.logger.warn(`Validation failed: ${JSON.stringify(fieldErrors)}`);
      throw new BadRequestException({
        message: 'Validation failed',
        errors: fieldErrors,
      });
    }
    return result.data;
  }
}
