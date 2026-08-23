import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService, TrackUsageDto } from './media.service';

@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  // ── Asset list ──────────────────────────────────────────────────────

  @Get()
  list(
    @Query('search') search?: string,
    @Query('mimeType') mimeType?: string,
    @Query('mediaType') mediaType?: 'image' | 'video',
    @Query('tag') tag?: string,
    @Query('folderId') folderId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const folderSet = folderId !== undefined;
    const resolvedFolderId = folderId === '' || folderId === 'null' ? null : folderId;
    return this.media.list({
      search,
      mimeType,
      mediaType,
      tag,
      folderId: resolvedFolderId,
      folderSet,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ── Upload ──────────────────────────────────────────────────────────

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('altText') altText?: string,
    @Body('uploadedBy') uploadedBy?: string,
    @Body('folderId') folderId?: string,
  ) {
    if (!file) throw new Error('No file provided');
    const resolvedFolderId = folderId ? folderId : null;
    return this.media.upload(file, altText, uploadedBy, resolvedFolderId);
  }

  // ── Bulk move ───────────────────────────────────────────────────────

  @Post('bulk-move')
  @HttpCode(204)
  bulkMove(@Body() dto: { assetIds: string[]; folderId: string | null }) {
    return this.media.moveAssets(dto.assetIds, dto.folderId ?? null);
  }

  // ── Folders (static routes — must precede /:id to avoid route conflicts) ──

  @Get('folders')
  listFolders() {
    return this.media.listFolders();
  }

  @Post('folders')
  createFolder(@Body() dto: { name: string; parentId?: string | null }) {
    return this.media.createFolder(dto.name, dto.parentId);
  }

  @Patch('folders/:folderId')
  renameFolder(@Param('folderId') id: string, @Body() dto: { name: string }) {
    return this.media.renameFolder(id, dto.name);
  }

  @Delete('folders/:folderId')
  @HttpCode(204)
  deleteFolder(@Param('folderId') id: string) {
    return this.media.deleteFolder(id);
  }

  // ── Single asset (parameterized — must come after static routes) ────

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.media.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: { altText?: string; title?: string; tags?: string[]; folderId?: string | null }) {
    return this.media.updateMetadata(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.media.delete(id);
  }

  @Get(':id/usage')
  getUsage(@Param('id') id: string) {
    return this.media.getUsage(id);
  }

  @Post(':id/usage')
  trackUsage(@Param('id') assetId: string, @Body() dto: TrackUsageDto) {
    return this.media.trackUsage(assetId, dto);
  }

  @Delete(':id/usage')
  @HttpCode(204)
  removeUsage(@Param('id') assetId: string, @Body('entityType') entityType: string, @Body('entityId') entityId: string, @Body('field') field: string) {
    return this.media.removeUsage(assetId, entityType, entityId, field);
  }
}
