import { Body, Controller, Delete, Get, HttpCode, Param, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IntegrationCredentialsService } from './integration-credentials.service';
import { ConfigurableProvider, CONFIGURABLE_PROVIDERS, PROVIDER_SCHEMAS, ProviderParamSchema } from './dto/integration-credential.dto';

/**
 * Admin-only — no @Public() anywhere here, so the global JwtAuthGuard applies,
 * same as every other admin/* controller.
 *
 * Secrets are write-only across this boundary: there is deliberately no route
 * that returns a stored credential. GET reports only whether one exists and
 * when it was last changed, so an admin can confirm the integration is
 * configured without the value ever leaving the server.
 */
@Controller('admin/integration-credentials')
export class IntegrationCredentialsController {
  constructor(private readonly credentials: IntegrationCredentialsService) {}

  /** Configuration status for every provider the UI can manage. */
  @Get()
  async list() {
    return Promise.all(CONFIGURABLE_PROVIDERS.map((provider) => this.credentials.describe(provider)));
  }

  @Get(':provider')
  describe(@Param('provider', new ZodValidationPipe(ProviderParamSchema)) provider: ConfigurableProvider) {
    return this.credentials.describe(provider);
  }

  /**
   * Replaces the stored secret. The body is validated against that provider's
   * own schema before anything is encrypted, so a typo can't be saved as an
   * opaque blob that only fails much later at call time.
   */
  @Put(':provider')
  @HttpCode(200)
  async set(@Param('provider', new ZodValidationPipe(ProviderParamSchema)) provider: ConfigurableProvider, @Body() body: unknown, @Req() req: Request) {
    const payload = new ZodValidationPipe(PROVIDER_SCHEMAS[provider]).transform(body) as Record<string, unknown>;
    const actor = (req.user as { email?: string; id?: string } | undefined)?.email ?? (req.user as { id?: string } | undefined)?.id ?? 'admin';

    await this.credentials.set(provider, JSON.stringify(payload), actor);
    return this.credentials.describe(provider);
  }

  /** Clears the secret. The integration then behaves exactly as it did before it was ever configured. */
  @Delete(':provider')
  @HttpCode(200)
  async clear(@Param('provider', new ZodValidationPipe(ProviderParamSchema)) provider: ConfigurableProvider) {
    await this.credentials.remove(provider);
    return this.credentials.describe(provider);
  }
}
