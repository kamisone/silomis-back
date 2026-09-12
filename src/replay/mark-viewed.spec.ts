import { NotFoundException } from '@nestjs/common';
import { ReplayAdminService } from './replay-admin.service';

/**
 * Clearing the unread badge from the list, without downloading and playing the
 * recording — most of a long list is dismissable from the row alone.
 */
function makeService(session: { viewedAt: Date | null } | null) {
  const update = jest.fn(async ({ data }: { data: { viewedAt: Date } }) => ({ viewedAt: data.viewedAt }));
  const prisma = { replaySession: { findUnique: jest.fn(async () => session), update } };
  return { service: new ReplayAdminService(prisma as never, null as never), update };
}

describe('ReplayAdminService.markViewed', () => {
  it('stamps an unviewed session', async () => {
    const { service, update } = makeService({ viewedAt: null });

    const res = await service.markViewed('s1');

    expect(res.viewedAt).toBeInstanceOf(Date);
    expect(update).toHaveBeenCalled();
  });

  it('is idempotent — a second click keeps the original timestamp', async () => {
    const first = new Date('2026-09-01T10:00:00Z');
    const { service, update } = makeService({ viewedAt: first });

    const res = await service.markViewed('s1');

    // Rewriting it would lose when the session was actually first looked at.
    expect(res.viewedAt).toBe(first);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an unknown session rather than silently succeeding', async () => {
    const { service } = makeService(null);

    await expect(service.markViewed('gone')).rejects.toBeInstanceOf(NotFoundException);
  });
});
