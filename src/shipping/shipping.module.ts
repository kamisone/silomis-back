import { Module } from '@nestjs/common';
import { TranslationsModule } from '../translations/translations.module';
import { PickupPointsModule } from './pickup-points/pickup-points.module';
import { ShippingService } from './shipping.service';
import { ShippingAdminController, ShippingPublicController } from './shipping.controller';
import { ShipmentAdminController } from './shipment-admin.controller';

@Module({
  imports: [TranslationsModule, PickupPointsModule],
  controllers: [ShippingPublicController, ShippingAdminController, ShipmentAdminController],
  providers: [ShippingService],
  exports: [ShippingService, PickupPointsModule],
})
export class ShippingModule {}
