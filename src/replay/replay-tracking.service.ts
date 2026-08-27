import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GcsService } from '../gcs/gcs.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { GeoIpService } from '../analytics-tracking/geo-ip.service';
import { StartReplaySessionDto, IngestReplayBatchDto, ReplayMarkerDto } from './dto/replay.dto';
import { containsLikelySensitiveData, batchByteSize } from './replay.util';
import { MAX_BATCH_BYTES, MAX_BATCH_EVENTS, MAX_SESSION_EVENTS, chunkObjectKey } from './replay.constants';

@Injectable()
export class ReplayTrackingService {
  private readonly logger = new Logger(ReplayTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gcs: GcsService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly geoIp: GeoIpService,
  ) {}

  /** Returns {} (never an error) when any gate fails — the recorder treats a missing sessionId as "don't record." */
  async startSession(
    dto: StartReplaySessionDto,
    meta: { ip: string | null; userAgent?: string; device?: string | null; source?: string | null },
  ): Promise<{ sessionId?: string }> {
    if (this.platformSettings.isAnalyticsExcluded(meta.ip)) return {};
    if (meta.userAgent !== undefined && this.platformSettings.isBotUserAgent(meta.userAgent)) return {};

    // The client's own page context is never trusted — only ever record test products.
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId }, select: { isTestProduct: true } });
    if (!product?.isTestProduct) return {};

    const now = new Date();
    const session = await this.prisma.replaySession.create({
      data: {
        productId: dto.productId,
        cartToken: dto.cartToken ?? null,
        visitorHash: this.geoIp.visitorHash(meta.ip),
        clientIp: meta.ip,
        countryCode: this.geoIp.countryFromIp(meta.ip),
        device: meta.device ?? null,
        source: meta.source ?? dto.source ?? null,
        viewportWidth: dto.viewportWidth ?? null,
        viewportHeight: dto.viewportHeight ?? null,
        pageUrl: dto.pageUrl ?? null,
        pageTitle: dto.pageTitle ?? null,
        startedAt: now,
        lastEventAt: now,
      },
    });
    return { sessionId: session.id };
  }

  /** Every failure mode is a silent no-op — an unknown/foreign/inactive session, an oversized batch, or a payload that trips the PII backstop. */
  async ingestBatch(sessionId: string, dto: IngestReplayBatchDto): Promise<void> {
    const session = await this.prisma.replaySession.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'active') return;
    if (dto.events.length === 0 && dto.markers.length === 0) return;
    if (dto.events.length > MAX_BATCH_EVENTS) return;
    if (batchByteSize(dto.events) > MAX_BATCH_BYTES) return;
    if (session.eventCount + dto.events.length > MAX_SESSION_EVENTS) return;
    if (containsLikelySensitiveData(dto.events)) return;

    try {
      if (dto.events.length > 0) {
        const key = chunkObjectKey(sessionId, session.chunkCount);
        const buffer = Buffer.from(JSON.stringify(dto.events));
        await this.gcs.upload(buffer, key, 'application/json', 'private');
        await this.prisma.replaySessionChunk.create({ data: { sessionId, sequence: session.chunkCount, gcsObjectKey: key, sizeBytes: buffer.byteLength, eventCount: dto.events.length } });
      }

      await this.saveMarkers(sessionId, dto.markers);

      const clickDelta = dto.markers.filter((m) => m.type === 'click').length;
      const scrollPcts = dto.markers.filter((m) => m.type === 'scroll').map((m) => Number((m.meta as { pct?: number } | null)?.pct ?? 0));
      const maxScrollPct = Math.max(session.maxScrollPct, ...scrollPcts, 0);

      await this.prisma.replaySession.update({
        where: { id: sessionId },
        data: {
          eventCount: { increment: dto.events.length },
          chunkCount: dto.events.length > 0 ? { increment: 1 } : undefined,
          clickCount: { increment: clickDelta },
          maxScrollPct,
          lastEventAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`Replay ingest failed for session ${sessionId}: ${(err as Error).message}`);
    }
  }

  private async saveMarkers(sessionId: string, markers: ReplayMarkerDto[]): Promise<void> {
    if (!markers.length) return;
    await this.prisma.replayEvent.createMany({
      data: markers.map((m) => ({ sessionId, type: m.type, timestampMs: m.timestampMs, label: m.label ?? null, meta: (m.meta ?? undefined) as never })),
    });
  }

  /**
   * Closes the session, persisting any trailing markers (the recorder's
   * `session_end`) first — ingestBatch refuses a non-active session, so once
   * the status flips there is no second chance to write them.
   */
  async endSession(sessionId: string, markers: ReplayMarkerDto[] = []): Promise<void> {
    const session = await this.prisma.replaySession.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'active') return;

    try {
      await this.saveMarkers(sessionId, markers);
    } catch (err) {
      // Losing the closing marker must never leave the session stuck 'active' —
      // the retention cron would be the only thing that ever reaped it.
      this.logger.warn(`Replay end markers failed for session ${sessionId}: ${(err as Error).message}`);
    }

    const endedAt = new Date();
    await this.prisma.replaySession.update({ where: { id: sessionId }, data: { status: 'ended', endedAt, durationMs: endedAt.getTime() - session.startedAt.getTime() } });
  }
}
