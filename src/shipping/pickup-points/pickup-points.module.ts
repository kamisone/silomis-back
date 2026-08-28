import { Logger, Module } from '@nestjs/common';
import { IntegrationCredentialsModule } from '../../integration-credentials/integration-credentials.module';
import { IntegrationCredentialsService } from '../../integration-credentials/integration-credentials.service';
import { PICKUP_POINT_PROVIDER, PickupPointProvider } from './providers/pickup-point.provider';
import { SendcloudPickupPointProvider } from './providers/sendcloud-pickup-point.provider';
import { StubPickupPointProvider } from './providers/stub-pickup-point.provider';
import { PickupPointsService } from './pickup-points.service';
import { PickupPointLocalitiesService } from './pickup-point-localities.service';
import { PickupPointsPublicController } from './pickup-points.controller';

/**
 * Which adapter backs PICKUP_POINT_PROVIDER.
 *
 * `PICKUP_POINT_PROVIDER=sendcloud|stub` decides it outright. With the variable
 * unset the default is environment-dependent: production gets the real adapter
 * (so a missing credential surfaces as a configuration error rather than
 * silently serving invented points to customers), everywhere else gets the
 * stub, which is what makes checkout runnable with no carrier account.
 */
function resolveProviderKind(): 'sendcloud' | 'stub' {
  const configured = process.env.PICKUP_POINT_PROVIDER?.trim().toLowerCase();
  if (configured === 'sendcloud' || configured === 'stub') return configured;
  return process.env.NODE_ENV === 'production' ? 'sendcloud' : 'stub';
}

@Module({
  // RedisModule is @Global — RedisService is injectable without importing it.
  imports: [IntegrationCredentialsModule],
  controllers: [PickupPointsPublicController],
  providers: [
    SendcloudPickupPointProvider,
    StubPickupPointProvider,
    {
      provide: PICKUP_POINT_PROVIDER,
      inject: [IntegrationCredentialsService],
      useFactory: (credentials: IntegrationCredentialsService): PickupPointProvider => {
        const kind = resolveProviderKind();
        const logger = new Logger('PickupPointsModule');
        if (kind === 'stub') {
          // Loud on purpose: the stub serves invented points through the real
          // checkout UI, and the only other signal is the fixture text itself.
          logger.warn('Pickup-point provider: STUB — points are invented fixtures, NOT carrier data. Set PICKUP_POINT_PROVIDER=sendcloud with credentials for real points.');
          return new StubPickupPointProvider();
        }
        logger.log('Pickup-point provider: sendcloud');
        return new SendcloudPickupPointProvider(credentials);
      },
    },
    PickupPointsService,
    PickupPointLocalitiesService,
  ],
  exports: [PickupPointsService, PickupPointLocalitiesService, PICKUP_POINT_PROVIDER],
})
export class PickupPointsModule {}
