import { PersonalizationAdminController } from './personalization-admin.controller';

/**
 * The thread wall is the one catalogue a customer picks from directly, and it
 * is the one an operator has to match to a physical cone. Both of those depend
 * on what this controller accepts.
 */
function makeController(overrides: { activeOthers?: number; createError?: unknown } = {}) {
  const { activeOthers = 3, createError } = overrides;
  const created: unknown[] = [];
  const updated: unknown[] = [];
  const deleted: string[] = [];

  const prisma = {
    threadColor: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => activeOthers),
      create: jest.fn(async (args: { data: unknown }) => {
        if (createError) throw createError;
        created.push(args.data);
        return args.data;
      }),
      update: jest.fn(async (args: { data: unknown }) => {
        updated.push(args.data);
        return args.data;
      }),
      delete: jest.fn(async (args: { where: { id: string } }) => {
        deleted.push(args.where.id);
        return {};
      }),
    },
  };
  const assetUrls = { resolveBatch: jest.fn(async () => new Map<string, string>()) };
  const personalization = { buildArtworkForCartItems: jest.fn(async () => new Map<string, string>()) };
  const controller = new PersonalizationAdminController(prisma as never, assetUrls as never, personalization as never);
  return { controller, created, updated, deleted, prisma };
}

const VALID = { brand: 'Madeira Polyneon', code: '1791', name: 'Teal', hex: '#0D8F8C' };

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    const res = (err as { response?: { message?: string } }).response;
    return res?.message ?? (err as Error).message;
  }
}

describe('thread colours — what the shop can offer', () => {
  it('stores a colour the operator can actually buy', async () => {
    const { controller, created } = makeController();
    await controller.createThread({ ...VALID });
    expect(created[0]).toMatchObject({ brand: 'Madeira Polyneon', code: '1791', name: 'Teal' });
  });

  it('normalises the hex, so one colour cannot become two swatches', async () => {
    const { controller, created } = makeController();
    await controller.createThread({ ...VALID, hex: '  #0D8F8C  ' });
    expect((created[0] as { hex: string }).hex).toBe('#0d8f8c');
  });

  it('trims the fields an operator reads off the cone', async () => {
    const { controller, created } = makeController();
    await controller.createThread({ ...VALID, code: '  1791 ', name: ' Teal ' });
    expect(created[0]).toMatchObject({ code: '1791', name: 'Teal' });
  });

  it.each([
    ['no code', { ...VALID, code: '   ' }, 'A thread needs a code.'],
    ['no name', { ...VALID, name: '' }, 'A thread needs a name.'],
    ['no brand', { ...VALID, brand: ' ' }, 'A thread needs a brand.'],
  ])('refuses a spool with %s', async (_label, body, expected) => {
    const { controller } = makeController();
    expect(await messageOf(controller.createThread(body))).toBe(expected);
  });

  it.each(['teal', '#12', '#12345g', 'rgb(1,2,3)', '#1a2b3c4d'])('refuses %s as a colour', async (hex) => {
    const { controller } = makeController();
    expect(await messageOf(controller.createThread({ ...VALID, hex }))).toContain('6-digit hex');
  });

  it('names the duplicate rather than returning a bare failure', async () => {
    // A spool added twice is an ordinary mistake and deserves a sentence.
    const { controller } = makeController({ createError: Object.assign(new Error('unique'), { code: 'P2002' }) });
    expect(await messageOf(controller.createThread({ ...VALID }))).toBe('Madeira Polyneon 1791 is already on the list.');
  });

  it('lets a partial edit through without demanding every field', async () => {
    const { controller, updated } = makeController();
    await controller.updateThread('t1', { isActive: false });
    expect(updated[0]).toEqual({ isActive: false });
  });

  it('still validates a hex that an edit does supply', async () => {
    const { controller } = makeController();
    expect(await messageOf(controller.updateThread('t1', { hex: 'nope' }))).toContain('6-digit hex');
  });

  it('removes a spool the shop no longer stocks', async () => {
    const { controller, deleted } = makeController({ activeOthers: 5 });
    await controller.deleteThread('t1');
    expect(deleted).toEqual(['t1']);
  });

  it('refuses to remove the last one — the editor cannot offer a design with no colour', async () => {
    const { controller, deleted } = makeController({ activeOthers: 0 });
    expect(await messageOf(controller.deleteThread('t1'))).toBe('At least one thread colour has to stay available.');
    expect(deleted).toEqual([]);
  });
});
