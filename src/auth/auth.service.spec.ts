import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

/**
 * Refresh-token rotation under concurrency. The first click after an idle
 * spell fires several refreshes with the same token at once, from several
 * front pods. Exactly one wins the claim; every other one must come away with
 * a valid session too — never trip the reuse branch, which revokes every
 * session the admin has.
 */
describe('AuthService.refresh — concurrent rotation', () => {
  const jwt = new JwtService({ secret: 'access-secret' });
  const OLD_ID = 'old-token-id';

  beforeAll(() => {
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
  });

  function setup(row: { revokedAt: Date | null; replacedByTokenId: string | null }) {
    const updateMany = jest.fn(async (args: { where: { revokedAt?: null }; data: Record<string, unknown> }) => {
      // The claim: only succeeds while the row is unrevoked.
      if (args.where.revokedAt === null) {
        if (row.revokedAt) return { count: 0 };
        Object.assign(row, args.data);
        return { count: 1 };
      }
      return { count: 0 };
    });
    const create = jest.fn(async (args: { data: { id?: string } }) => ({ id: args.data.id ?? `new-${create.mock.calls.length}` }));
    const prisma = {
      refreshToken: {
        findUnique: jest.fn(async () => ({ id: OLD_ID, adminId: 'admin-1', expiresAt: new Date(Date.now() + 86_400_000), ...row })),
        updateMany,
        update: jest.fn(),
        create,
      },
    };
    const service = new AuthService({} as never, jwt, {} as never, prisma as never);
    const token = jwt.sign({ sub: 'admin-1', email: 'a@b.c', jti: OLD_ID }, { secret: 'refresh-secret', expiresIn: '15d' });
    return { service, token, updateMany, create, row };
  }

  it('records the replacement in the same write that revokes the old token', async () => {
    const { service, token, updateMany, create } = setup({ revokedAt: null, replacedByTokenId: null });

    await service.refresh(token);

    // One write carries both: a concurrent reader can never see "revoked"
    // without "replaced by", which is what it used to mistake for theft.
    const claim = updateMany.mock.calls[0][0];
    expect(claim.data).toEqual(expect.objectContaining({ revokedAt: expect.any(Date), replacedByTokenId: expect.any(String) }));
    expect(create.mock.calls[0][0].data.id).toBe(claim.data.replacedByTokenId);
  });

  it('hands a request that lost the claim a fresh session instead of revoking everything', async () => {
    const { service, token, updateMany } = setup({ revokedAt: new Date(), replacedByTokenId: 'winner-id' });

    await expect(service.refresh(token)).resolves.toEqual(expect.objectContaining({ refresh_token: expect.any(String) }));
    // Only the (failed) claim — no revoke-all sweep.
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('still treats a token replayed after the grace window as theft', async () => {
    const { service, token, updateMany } = setup({ revokedAt: new Date(Date.now() - 60_000), replacedByTokenId: 'winner-id' });

    await expect(service.refresh(token)).rejects.toThrow('already been used');
    expect(updateMany).toHaveBeenLastCalledWith({ where: { adminId: 'admin-1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });
});
