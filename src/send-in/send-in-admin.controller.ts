import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ItemTypeInput, SendInService, SendInUpdate } from './send-in.service';

/**
 * The send-in desk: every item on its way in, on the bench, or on its way
 * back. Moving a job along here is what the customer sees on their tracking
 * page and gets in their inbox.
 */
@Controller('admin/shop/send-in')
export class SendInAdminController {
  constructor(private readonly sendIn: SendInService) {}

  @Get()
  list(@Query('status') status?: string, @Query('search') search?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.sendIn.list({ status, search, limit: limit ? parseInt(limit, 10) : undefined, offset: offset ? parseInt(offset, 10) : undefined });
  }

  // ── What may be posted in: the shop's own list ─────────────────────────

  /** The service's on/off switch. */
  @Get('settings')
  async settings() {
    return { enabled: await this.sendIn.isEnabled() };
  }

  @Patch('settings')
  updateSettings(@Body() body: { enabled?: boolean }) {
    return this.sendIn.setEnabled(body.enabled !== false);
  }

  @Get('item-types')
  listItemTypes() {
    return this.sendIn.listItemTypes();
  }

  @Post('item-types')
  createItemType(@Body() body: ItemTypeInput) {
    return this.sendIn.createItemType(body);
  }

  @Patch('item-types/:id')
  updateItemType(@Param('id') id: string, @Body() body: Partial<ItemTypeInput>) {
    return this.sendIn.updateItemType(id, body);
  }

  @Delete('item-types/:id')
  deleteItemType(@Param('id') id: string) {
    return this.sendIn.deleteItemType(id);
  }

  @Get('order/:orderId')
  forOrder(@Param('orderId') orderId: string) {
    return this.sendIn.forOrder(orderId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: SendInUpdate) {
    return this.sendIn.update(id, body);
  }

  /** Redraws the customer's mockup from the stored photo and design — for a job whose render failed at order time. */
  @Post(':id/mockup')
  async mockup(@Param('id') id: string) {
    await this.sendIn.renderMockup(id);
    return this.sendIn.forJob(id);
  }
}
