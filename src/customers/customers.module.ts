import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerAdminController } from './customer-admin.controller';
import { CustomerGroupAdminController } from './customer-group-admin.controller';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  // CustomerGroupAdminController must register before CustomerAdminController:
  // Express matches routes in registration order, and CustomerAdminController's
  // `@Get(':id')` would otherwise swallow `GET /admin/shop/customers/groups`
  // (id="groups") before the group controller's exact route is ever tried.
  controllers: [CustomerGroupAdminController, CustomerAdminController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomersModule {}
